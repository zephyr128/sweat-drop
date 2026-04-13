'use server';

import { createClient } from '@/lib/supabase-server';
import { getAdminClient } from '@/lib/utils/supabase-admin';
import { logger } from '@/lib/utils/logger';

export interface AtRiskMember {
  user_id: string;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
  email: string | null;
  last_checkin: string | null;
  days_inactive: number;
  total_checkins: number;
  has_push_token: boolean;
}

export interface AtRiskResult {
  members: AtRiskMember[];
  count: number;
  daysInactiveThreshold: number;
}

export interface Campaign {
  id: string;
  gym_id: string;
  campaign_type: string;
  title: string;
  body: string;
  deep_link: string | null;
  reward_id: string | null;
  audience_type: string;
  audience_params: Record<string, unknown>;
  status: string;
  target_count: number;
  sent_count: number;
  failed_count: number;
  queued_at: string | null;
  sent_at: string | null;
  created_at: string;
}

export interface CreateCampaignParams {
  gymId: string;
  campaignType: string;
  title: string;
  body: string;
  deepLink?: string | null;
  rewardId?: string | null;
  audienceType: string;
  audienceParams?: Record<string, unknown> | null;
  userIds?: string[] | null;
}

function rpcJsonError(result: Record<string, unknown> | null): string | undefined {
  if (result && typeof result.error === 'string' && result.error.length > 0) {
    return result.error;
  }
  return undefined;
}

/**
 * Fetch members considered inactive for push / engagement targeting.
 * Calls RPC `get_members_at_risk`.
 */
export async function getAtRiskMembers(
  gymId: string,
  daysInactive?: number,
): Promise<{ success: boolean; data?: AtRiskResult; error?: string }> {
  const threshold = daysInactive ?? 14;
  try {
    const supabase = await createClient();

    const { data, error } = await supabase.rpc('get_members_at_risk', {
      p_gym_id: gymId,
      p_days_inactive: threshold,
    });

    if (error) throw error;

    const result = data as Record<string, unknown> | null;
    const errMsg = rpcJsonError(result);
    if (errMsg) {
      return { success: false, error: errMsg };
    }

    const rawMembers = result?.members;
    const members: AtRiskMember[] = Array.isArray(rawMembers)
      ? (rawMembers as AtRiskMember[])
      : [];

    const count = typeof result?.count === 'number' ? result.count : members.length;
    const daysInactiveThreshold =
      typeof result?.days_inactive_threshold === 'number'
        ? result.days_inactive_threshold
        : threshold;

    return {
      success: true,
      data: {
        members,
        count,
        daysInactiveThreshold,
      },
    };
  } catch (error: unknown) {
    logger.error('Error fetching at-risk members', { error, gymId, daysInactive: threshold });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch at-risk members',
    };
  }
}

/**
 * Create a draft engagement campaign and resolve targets.
 * Calls RPC `create_engagement_campaign`.
 */
export async function createCampaign(
  params: CreateCampaignParams,
): Promise<{
  success: boolean;
  data?: { campaign_id: string; target_count: number; status: string };
  error?: string;
}> {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase.rpc('create_engagement_campaign', {
      p_gym_id: params.gymId,
      p_campaign_type: params.campaignType,
      p_title: params.title,
      p_body: params.body,
      p_deep_link: params.deepLink ?? null,
      p_reward_id: params.rewardId ?? null,
      p_audience_type: params.audienceType,
      p_audience_params: params.audienceParams ?? {},
      p_user_ids: params.userIds ?? null,
    });

    if (error) throw error;

    const result = data as Record<string, unknown> | null;
    const errMsg = rpcJsonError(result);
    if (errMsg) {
      return { success: false, error: errMsg };
    }

    if (result?.success !== true) {
      return { success: false, error: 'Campaign creation did not succeed' };
    }

    const campaignId = result.campaign_id;
    if (typeof campaignId !== 'string') {
      return { success: false, error: 'Invalid response from create campaign' };
    }

    return {
      success: true,
      data: {
        campaign_id: campaignId,
        target_count: typeof result.target_count === 'number' ? result.target_count : 0,
        status: typeof result.status === 'string' ? result.status : 'draft',
      },
    };
  } catch (error: unknown) {
    logger.error('Error creating engagement campaign', { error, gymId: params.gymId });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create campaign',
    };
  }
}

/**
 * Queue push deliveries for a draft (or failed) campaign.
 * Verifies `campaignId` belongs to `gymId`, then calls RPC `queue_engagement_delivery`.
 * After queuing, immediately invokes the process-campaigns edge function.
 */
export async function queueCampaign(
  campaignId: string,
  gymId: string,
): Promise<{
  success: boolean;
  data?: { campaign_id: string; queued_deliveries: number; status: string };
  error?: string;
}> {
  try {
    const supabase = await createClient();

    // Use admin client for the lookup — RLS on engagement_campaigns
    // blocks reads for gym_owner profiles that lack admin_gym_id.
    const supabaseAdmin = getAdminClient();
    if (!supabaseAdmin) {
      return { success: false, error: 'Admin client not available' };
    }

    const { data: row, error: lookupError } = await supabaseAdmin
      .from('engagement_campaigns')
      .select('id')
      .eq('id', campaignId)
      .eq('gym_id', gymId)
      .maybeSingle();

    if (lookupError) throw lookupError;
    if (!row) {
      return { success: false, error: 'Campaign not found for this gym' };
    }

    const { data, error } = await supabase.rpc('queue_engagement_delivery', {
      p_campaign_id: campaignId,
    });

    if (error) throw error;

    const result = data as Record<string, unknown> | null;
    const errMsg = rpcJsonError(result);
    if (errMsg) {
      return { success: false, error: errMsg };
    }

    if (result?.success !== true) {
      return { success: false, error: 'Queue operation did not succeed' };
    }

    // Fire-and-forget: invoke process-campaigns to send immediately
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (supabaseUrl && serviceKey) {
      fetch(`${supabaseUrl}/functions/v1/process-campaigns`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({ campaign_id: campaignId }),
      }).catch((err) => {
        logger.error('Failed to invoke process-campaigns', { error: err, campaignId });
      });
    }

    return {
      success: true,
      data: {
        campaign_id: typeof result.campaign_id === 'string' ? result.campaign_id : campaignId,
        queued_deliveries:
          typeof result.queued_deliveries === 'number' ? result.queued_deliveries : 0,
        status: typeof result.status === 'string' ? result.status : 'queued',
      },
    };
  } catch (error: unknown) {
    logger.error('Error queueing engagement campaign', { error, campaignId, gymId });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to queue campaign',
    };
  }
}

/**
 * List recent campaigns for a gym (newest first).
 */
export async function getGymCampaigns(
  gymId: string,
): Promise<{ success: boolean; data?: Campaign[]; error?: string }> {
  try {
    // Use admin client to bypass RLS — access control is enforced by
    // requireGymAccess in the page server component.
    const supabaseAdmin = getAdminClient();
    if (!supabaseAdmin) {
      return { success: false, error: 'Admin client not available' };
    }

    const { data, error } = await supabaseAdmin
      .from('engagement_campaigns')
      .select(
        'id, gym_id, campaign_type, title, body, deep_link, reward_id, audience_type, audience_params, status, target_count, sent_count, failed_count, queued_at, sent_at, created_at',
      )
      .eq('gym_id', gymId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;

    const rows = (data ?? []) as Campaign[];
    return { success: true, data: rows };
  } catch (error: unknown) {
    logger.error('Error listing engagement campaigns', { error, gymId });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to load campaigns',
    };
  }
}
