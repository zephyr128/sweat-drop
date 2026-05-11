// Edge Function: process-campaigns
// Description: Processes queued engagement campaigns by sending push notifications
//              and persisting to in-app inbox via send-push.
//
// AGENT NOTE: [2026-05-11] - edge-function-agent (feature_multigym_notification_differentiation)
//   Pre-fetches gym name + logo_url for all campaign gym_ids before the campaign loop.
//   Push title suffixed with gym name: "[Campaign Title] — [Gym Name]".
//   Push data now includes gym_id (already present via campaign.gym_id), gym_name,
//   gym_logo_url so the in-app inbox can render gym logos and users can identify
//   which gym sent the campaign.
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
import { getEdgeInternalJwt } from '../_shared/edge-auth.ts';

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
    const internalJwt = getEdgeInternalJwt();
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

    // Pre-fetch gym name + logo_url for all campaign gym_ids.
    //
    // Schema note: branding columns were removed from `public.gyms` by the
    // 20240101000034_unify_branding_and_cleanup migration. Logos now live in
    // `public.owner_branding` keyed on `owner_id`. We therefore need TWO
    // lookups: gyms → (id, name, owner_id), then owner_branding → logo_url
    // joined in memory. Queries that still reference `gyms.logo_url` raise
    // "column gyms.logo_url does not exist" (see prod logs 2026-05-11).
    //
    // We do NOT default the name to a placeholder ("your gym" etc.) — a missing
    // or whitespace-only name means we cannot reliably differentiate the gym
    // for the recipient and we must NOT pollute the inbox with misleading
    // labels. Downstream code treats a null name as "omit the gym_name field
    // from the payload" so the mobile inbox simply hides the gym chip instead
    // of showing a fake name.
    const campaignGymIds = [...new Set(
      campaigns.map((c: any) => c.gym_id).filter((id: unknown): id is string => typeof id === 'string' && id.length > 0)
    )];
    const gymInfoById = new Map<string, { name: string | null; logo_url: string | null }>();
    if (campaignGymIds.length > 0) {
      const { data: gymRows, error: gymPrefetchErr } = await supabase
        .from('gyms')
        .select('id, name, owner_id')
        .in('id', campaignGymIds);
      if (gymPrefetchErr) {
        console.error(JSON.stringify({
          event: 'process-campaigns:gym_prefetch_error',
          gym_ids: campaignGymIds,
          error: gymPrefetchErr.message,
        }));
      }

      // Resolve branding (logo) per owner via owner_branding.
      const ownerIds = [...new Set(
        (gymRows ?? [])
          .map((g: any) => g?.owner_id)
          .filter((id: unknown): id is string => typeof id === 'string' && id.length > 0)
      )];
      const logoByOwnerId = new Map<string, string | null>();
      if (ownerIds.length > 0) {
        const { data: brandingRows, error: brandingErr } = await supabase
          .from('owner_branding')
          .select('owner_id, logo_url')
          .in('owner_id', ownerIds);
        if (brandingErr) {
          console.error(JSON.stringify({
            event: 'process-campaigns:owner_branding_prefetch_error',
            owner_ids: ownerIds,
            error: brandingErr.message,
          }));
        }
        for (const b of brandingRows ?? []) {
          if (!b?.owner_id) continue;
          const logoUrl = typeof (b as any).logo_url === 'string' && (b as any).logo_url.length > 0
            ? (b as any).logo_url as string
            : null;
          logoByOwnerId.set(b.owner_id, logoUrl);
        }
      }

      for (const g of gymRows ?? []) {
        if (!g?.id) continue;
        const rawName = typeof g.name === 'string' ? g.name.trim() : '';
        const name = rawName.length > 0 ? rawName : null;
        const logoUrl = g.owner_id ? (logoByOwnerId.get(g.owner_id) ?? null) : null;
        if (!name) {
          console.warn(JSON.stringify({
            event: 'process-campaigns:gym_name_empty_in_prefetch',
            gym_id: g.id,
          }));
        }
        gymInfoById.set(g.id, { name, logo_url: logoUrl });
      }
      // Surface gyms that were requested but not returned at all.
      for (const gid of campaignGymIds) {
        if (!gymInfoById.has(gid)) {
          console.warn(JSON.stringify({
            event: 'process-campaigns:gym_prefetch_missing_row',
            gym_id: gid,
          }));
        }
      }
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

        // Gym context for push differentiation.
        // Primary path: pre-fetched map. Fallback path: single-row query for this
        // campaign gym_id (defensive against a transient prefetch miss).
        let gymInfo = campaign.gym_id ? gymInfoById.get(campaign.gym_id) : undefined;
        let gymInfoSource: 'prefetch' | 'fallback_query' | 'missing' | 'no_gym_id' =
          campaign.gym_id ? (gymInfo ? 'prefetch' : 'missing') : 'no_gym_id';
        if (campaign.gym_id && !gymInfo) {
          // Fallback: two-query lookup matching prefetch schema (logo lives in
          // owner_branding, not gyms — see schema note above).
          const { data: fallbackGym, error: fallbackGymErr } = await supabase
            .from('gyms')
            .select('name, owner_id')
            .eq('id', campaign.gym_id)
            .maybeSingle();
          if (fallbackGymErr) {
            console.error(JSON.stringify({
              event: 'process-campaigns:gym_lookup_fallback_error',
              campaign_id: campaign.id,
              gym_id: campaign.gym_id,
              error: fallbackGymErr.message,
            }));
          } else if (fallbackGym) {
            const rawName = typeof fallbackGym.name === 'string' ? fallbackGym.name.trim() : '';
            const ownerId = typeof (fallbackGym as any).owner_id === 'string'
              ? (fallbackGym as any).owner_id as string
              : null;
            let logoUrl: string | null = null;
            if (ownerId) {
              const { data: fallbackBranding, error: fallbackBrandingErr } = await supabase
                .from('owner_branding')
                .select('logo_url')
                .eq('owner_id', ownerId)
                .maybeSingle();
              if (fallbackBrandingErr) {
                console.error(JSON.stringify({
                  event: 'process-campaigns:owner_branding_fallback_error',
                  campaign_id: campaign.id,
                  owner_id: ownerId,
                  error: fallbackBrandingErr.message,
                }));
              } else if (fallbackBranding && typeof (fallbackBranding as any).logo_url === 'string'
                && (fallbackBranding as any).logo_url.length > 0) {
                logoUrl = (fallbackBranding as any).logo_url as string;
              }
            }
            gymInfo = {
              name: rawName.length > 0 ? rawName : null,
              logo_url: logoUrl,
            };
            gymInfoSource = 'fallback_query';
          } else {
            console.warn(JSON.stringify({
              event: 'process-campaigns:gym_lookup_missing',
              campaign_id: campaign.id,
              gym_id: campaign.gym_id,
            }));
          }
        }

        const gymName = gymInfo?.name && gymInfo.name.trim().length > 0
          ? gymInfo.name.trim()
          : null;
        const gymLogoUrl = gymInfo?.logo_url ?? null;
        const campaignTitle = campaign.gym_id && gymName
          ? `${campaign.title} — ${gymName}`
          : campaign.title;

        // Structured diagnostic — visible in Supabase Function logs. Lets us
        // verify exactly which path resolved gym context for any given
        // campaign without rerunning queries by hand.
        console.log(JSON.stringify({
          event: 'process-campaigns:gym_context_resolved',
          campaign_id: campaign.id,
          gym_id: campaign.gym_id,
          source: gymInfoSource,
          gym_name_present: !!gymName,
          gym_logo_present: !!gymLogoUrl,
        }));

        // Batch deliveries for send-push (max batch per call)
        const BATCH_SIZE = 80;
        let sentCount = 0;
        let failedCount = 0;

        const inboxData: Record<string, unknown> = {
          type: notifType,
          campaign_id: campaign.id,
          ...(campaign.gym_id ? { gym_id: campaign.gym_id } : {}),
          ...(gymName ? { gym_name: gymName } : {}),
          ...(gymLogoUrl ? { gym_logo_url: gymLogoUrl } : {}),
          ...(deepLink ? { deep_link: deepLink } : {}),
        };

        for (let i = 0; i < deliveries.length; i += BATCH_SIZE) {
          const batch = deliveries.slice(i, i + BATCH_SIZE);

          const tokens: string[] = [];
          const userIds: string[] = [];
          const deliveryIds: string[] = [];
          const tokenlessUserIds: string[] = [];
          const tokenlessDeliveryIds: string[] = [];

          for (const d of batch) {
            const token = (d as any).profiles?.expo_push_token;
            if (token && isExpoPushToken(token)) {
              tokens.push(token);
              userIds.push(d.user_id);
              deliveryIds.push(d.id);
            } else {
              tokenlessUserIds.push(d.user_id);
              tokenlessDeliveryIds.push(d.id);
            }
          }

          // Users without a valid push token (declined notifications, stale
          // DeviceNotRegistered tokens cleared by send-push, fresh reinstalls)
          // must still receive the campaign in their in-app inbox. send-push
          // handles inbox persistence for users who DO have tokens via its
          // user_ids input; for everyone else we persist directly here and
          // mark their delivery as failed with a clear reason so retry/cron
          // won't re-process them and the dashboard counts stay honest.
          if (tokenlessDeliveryIds.length > 0) {
            const inboxRows = [...new Set(tokenlessUserIds)]
              .filter((uid) => typeof uid === 'string' && uid.length > 0)
              .map((uid) => ({
                user_id: uid,
                type: notifType,
                title: campaignTitle,
                body: campaign.body,
                data: inboxData,
              }));
            if (inboxRows.length > 0) {
              const { error: inboxErr } = await supabase
                .from('user_notifications')
                .insert(inboxRows);
              if (inboxErr) {
                errors.push(
                  `Campaign ${campaign.id} inbox insert (tokenless): ${inboxErr.message}`,
                );
              }
            }
            await supabase
              .from('engagement_campaign_deliveries')
              .update({
                status: 'failed',
                error_text: 'no_valid_token',
                sent_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              })
              .in('id', tokenlessDeliveryIds);
            failedCount += tokenlessDeliveryIds.length;
          }

          if (tokens.length === 0) {
            continue;
          }

          const pushRes = await fetch(`${supabaseUrl}/functions/v1/send-push`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${internalJwt}`,
            },
            body: JSON.stringify({
              client_ref: `campaign_${campaign.id.slice(0, 8)}`,
              tokens,
              user_ids: userIds,
              title: campaignTitle,
              body: campaign.body,
              data: inboxData,
            }),
          });

          let pushText = '';
          let pushJson: any = null;
          try {
            pushText = await pushRes.text();
            pushJson = pushText ? JSON.parse(pushText) : null;
          } catch {
            pushJson = null;
          }
          if (!pushRes.ok) {
            console.error(
              `[process-campaigns] send-push HTTP ${pushRes.status} for campaign ${campaign.id}: ${pushText.slice(0, 200)}`
            );
          }

          // Consider the push call successful when the HTTP response is ok and
          // send-push accepted the payload (ok:true). We do NOT require
          // receipt_ok > 0 because some users may have revoked push permission
          // (send-push returns receipt_error for those) but the call itself
          // still succeeded and inbox rows were written for all user_ids.
          const pushCallOk = pushRes.ok && pushJson?.ok === true;

          if (pushCallOk) {
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
                error_text: pushJson?.error || `http_${pushRes.status}`,
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
