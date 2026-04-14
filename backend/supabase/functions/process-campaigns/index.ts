// Edge Function: process-campaigns
// Description: Processes queued engagement campaigns by sending push notifications
//              and persisting to in-app inbox via send-push.
//
// Called by:
//   - Admin panel immediately after queueCampaign
//   - pg_cron every 2 minutes as a fallback sweep
//
// INTERFACE CONTRACT:
//   Input:  { campaign_id?: UUID } (optional — processes all queued if omitted)
//   Output: { success, campaigns_processed, total_sent, total_failed, errors }

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { deliveryCountFromSendPushBody, isExpoPushToken, EXPO_PUSH_BATCH_SIZE } from '../_shared/expo-push.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { campaign_id }: { campaign_id?: string } = await req.json().catch(() => ({}));

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Find campaigns to process
    let query = supabase
      .from('engagement_campaigns')
      .select('id, gym_id, campaign_type, title, body, deep_link, status')
      .in('status', ['queued']);

    if (campaign_id) {
      query = query.eq('id', campaign_id);
    }

    const { data: campaigns, error: cErr } = await query;
    if (cErr) throw new Error(`Failed to fetch campaigns: ${cErr.message}`);

    if (!campaigns || campaigns.length === 0) {
      return new Response(
        JSON.stringify({ success: true, campaigns_processed: 0, message: 'No queued campaigns.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let campaignsProcessed = 0;
    let totalSent = 0;
    let totalFailed = 0;
    const errors: string[] = [];

    for (const campaign of campaigns) {
      try {
        // Mark campaign as sending
        await supabase
          .from('engagement_campaigns')
          .update({ status: 'sending', updated_at: new Date().toISOString() })
          .eq('id', campaign.id);

        // Fetch pending deliveries with FRESH push tokens from profiles (not stale
        // snapshots from engagement_campaign_targets). Users may have switched devices
        // between campaign creation and send time.
        const { data: deliveries, error: dErr } = await supabase
          .from('engagement_campaign_deliveries')
          .select('id, user_id, profiles!inner(expo_push_token)')
          .eq('campaign_id', campaign.id)
          .eq('status', 'pending');

        if (dErr) {
          errors.push(`Campaign ${campaign.id}: ${dErr.message}`);
          continue;
        }

        if (!deliveries || deliveries.length === 0) {
          await supabase
            .from('engagement_campaigns')
            .update({ status: 'sent', sent_at: new Date().toISOString(), updated_at: new Date().toISOString() })
            .eq('id', campaign.id);
          campaignsProcessed++;
          continue;
        }

        // Normalize deep_link: strip scheme prefix for mobile compatibility
        let deepLink = campaign.deep_link || null;
        if (deepLink && deepLink.startsWith('sweatdrop://')) {
          deepLink = '/' + deepLink.replace('sweatdrop://', '');
        }

        // Determine notification type for inbox
        const notifType = campaign.campaign_type === 'offer' ? 'comeback_offer' : 'campaign';

        // Batch deliveries for send-push (max batch per call)
        const BATCH_SIZE = 80;
        let sentCount = 0;
        let failedCount = 0;

        for (let i = 0; i < deliveries.length; i += BATCH_SIZE) {
          const batch = deliveries.slice(i, i + BATCH_SIZE);

          const tokens: string[] = [];
          const userIds: string[] = [];
          const deliveryIds: string[] = [];

          for (const d of batch) {
            const token = (d as any).profiles?.expo_push_token;
            if (token && isExpoPushToken(token)) {
              tokens.push(token);
              userIds.push(d.user_id);
              deliveryIds.push(d.id);
            }
          }

          if (tokens.length === 0) {
            // Mark as failed — no valid tokens
            const failIds = batch.map((d) => d.id);
            await supabase
              .from('engagement_campaign_deliveries')
              .update({ status: 'failed', error_text: 'no_valid_token', sent_at: new Date().toISOString(), updated_at: new Date().toISOString() })
              .in('id', failIds);
            failedCount += failIds.length;
            continue;
          }

          const pushRes = await fetch(`${supabaseUrl}/functions/v1/send-push`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${serviceKey}`,
            },
            body: JSON.stringify({
              client_ref: `campaign_${campaign.id.slice(0, 8)}`,
              tokens,
              user_ids: userIds,
              title: campaign.title,
              body: campaign.body,
              data: {
                type: notifType,
                campaign_id: campaign.id,
                ...(deepLink ? { deep_link: deepLink } : {}),
              },
            }),
          });

          const pushJson = await pushRes.json().catch(() => null);
          const delivered = deliveryCountFromSendPushBody(pushJson);

          if (pushRes.ok && delivered > 0) {
            await supabase
              .from('engagement_campaign_deliveries')
              .update({ status: 'sent', sent_at: new Date().toISOString(), updated_at: new Date().toISOString() })
              .in('id', deliveryIds);
            sentCount += deliveryIds.length;
          } else {
            await supabase
              .from('engagement_campaign_deliveries')
              .update({
                status: 'failed',
                error_text: pushJson?.error || 'push_failed',
                sent_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              })
              .in('id', deliveryIds);
            failedCount += deliveryIds.length;
          }
        }

        // Update campaign totals
        await supabase
          .from('engagement_campaigns')
          .update({
            status: 'sent',
            sent_count: sentCount,
            failed_count: failedCount,
            sent_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', campaign.id);

        totalSent += sentCount;
        totalFailed += failedCount;
        campaignsProcessed++;
      } catch (err: any) {
        errors.push(`Campaign ${campaign.id}: ${err.message}`);

        await supabase
          .from('engagement_campaigns')
          .update({ status: 'failed', updated_at: new Date().toISOString() })
          .eq('id', campaign.id)
          .catch(() => {});
      }
    }

    console.log(JSON.stringify({
      event: 'process-campaigns',
      campaigns_processed: campaignsProcessed,
      total_sent: totalSent,
      total_failed: totalFailed,
      error_count: errors.length,
    }));

    return new Response(
      JSON.stringify({
        success: errors.length === 0,
        campaigns_processed: campaignsProcessed,
        total_sent: totalSent,
        total_failed: totalFailed,
        errors: errors.length > 0 ? errors : undefined,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error(JSON.stringify({
      event: 'process-campaigns',
      fatal: true,
      error: (error.message ?? '').slice(0, 200),
    }));

    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
