'use server';

import { getAdminClient } from '@/lib/utils/supabase-admin';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const REDEMPTION_LIMITS = ['unlimited', 'once', 'once_per_day', 'once_per_week', 'once_per_month'] as const;
const STORE_REWARD_TYPES = ['physical', 'coffee', 'protein_snack', 'day_pass', 'pt_intro', 'merch_small', 'merch_premium', 'membership'] as const;

/** Empty / whitespace → null for optional TIMESTAMPTZ date fields */
function availabilityToDb(value: string | undefined | null): string | null {
  if (value == null) return null;
  const t = String(value).trim();
  return t === '' ? null : t;
}

type PriceBandMap = Record<string, { min: number; max: number }>;

function parsePriceBands(raw: unknown): PriceBandMap {
  if (!raw || typeof raw !== 'object') return {};
  const result: PriceBandMap = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== 'object') continue;
    const min = Number((value as Record<string, unknown>).min);
    const max = Number((value as Record<string, unknown>).max);
    if (Number.isFinite(min) && Number.isFinite(max)) {
      result[key] = { min, max };
    }
  }
  return result;
}

function resolveBand(bands: PriceBandMap, rewardType: string): { min: number; max: number } | null {
  return bands[rewardType] || bands.physical || null;
}

const PRICE_CALC_MODES = ['manual_drops', 'discount_from_rsd'] as const;

const createStoreItemSchema = z.object({
  gymId: z.string().uuid(),
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  priceDrops: z.number().int().positive('Price must be greater than 0'),
  stock: z.preprocess(
    (val) =>
      val === '' || val === undefined || (typeof val === 'number' && Number.isNaN(val)) ? undefined : val,
    z.number().int().min(0).optional()
  ),
  imageUrl: z.string().url().optional().or(z.literal('')),
  rewardType: z.enum(STORE_REWARD_TYPES).default('physical'),
  redemptionLimit: z.enum(REDEMPTION_LIMITS).default('unlimited'),
  sponsorName: z.string().optional(),
  sponsorLogo: z.string().url().optional().or(z.literal('')),
  availableFrom: z.string().default(''),
  availableUntil: z.string().default(''),
  priceCalcMode: z.enum(PRICE_CALC_MODES).default('manual_drops'),
  basePriceRsd: z.number().positive().optional(),
  discountPercent: z.number().min(0).max(95).optional(),
});

async function validateRewardPriceBand(
  supabaseAdmin: ReturnType<typeof getAdminClient>,
  gymId: string,
  rewardType: string,
  priceDrops: number,
  opts?: { isDiscountMode?: boolean; basePriceDrops?: number },
) {
  if (!supabaseAdmin) return null;
  const [gymCfg, globalCfg] = await Promise.all([
    (supabaseAdmin.from('tokenomics_config') as any).select('price_band_json, band_enforcement_mode').eq('gym_id', gymId).maybeSingle(),
    (supabaseAdmin.from('tokenomics_config') as any).select('price_band_json, band_enforcement_mode').is('gym_id', null).maybeSingle(),
  ]);

  const cfg = gymCfg.data || globalCfg.data;
  if (!cfg) return null;

  const enforcementMode = (cfg as any).band_enforcement_mode;
  if (enforcementMode !== 'enforce') return null;

  const bands = parsePriceBands((cfg as any).price_band_json);
  const band = resolveBand(bands, rewardType);
  if (!band) return null;

  if (opts?.isDiscountMode) {
    const base = opts.basePriceDrops ?? priceDrops;
    if (base > band.max) {
      return `Strict mode: base price for ${rewardType} exceeds band maximum (${band.max} drops).`;
    }
    return null;
  }

  if (priceDrops < band.min || priceDrops > band.max) {
    return `Strict mode: price for ${rewardType} should be between ${band.min} and ${band.max} drops.`;
  }
  return null;
}

export async function getStorePriceGuidance(gymId: string) {
  try {
    const supabaseAdmin = getAdminClient();
    if (!supabaseAdmin) return { success: false, error: 'Admin client not available' };

    const [gymCfg, globalCfg] = await Promise.all([
      (supabaseAdmin.from('tokenomics_config') as any).select('price_band_json').eq('gym_id', gymId).maybeSingle(),
      (supabaseAdmin.from('tokenomics_config') as any).select('price_band_json').is('gym_id', null).maybeSingle(),
    ]);

    const cfg = gymCfg.data || globalCfg.data;
    const bands = parsePriceBands((cfg as any)?.price_band_json || {});
    return { success: true, data: bands };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

async function resolveGymConversion(supabaseAdmin: NonNullable<ReturnType<typeof getAdminClient>>, gymId: string): Promise<number> {
  const [gymCfg, globalCfg] = await Promise.all([
    (supabaseAdmin.from('tokenomics_config') as any).select('drops_per_rsd').eq('gym_id', gymId).maybeSingle(),
    (supabaseAdmin.from('tokenomics_config') as any).select('drops_per_rsd').is('gym_id', null).maybeSingle(),
  ]);
  const raw = Number((gymCfg.data || globalCfg.data)?.drops_per_rsd);
  return Number.isFinite(raw) && raw > 0 ? raw : 2.0;
}

function computeDiscountFields(basePriceRsd: number, discountPercent: number, dropsPerRsd: number) {
  const effectiveRsd = basePriceRsd * (1 - Math.min(95, Math.max(0, discountPercent)) / 100);
  const effectiveDrops = Math.max(1, Math.round(effectiveRsd * dropsPerRsd));
  return {
    price_drops: effectiveDrops,
    price_calc_mode: 'discount_from_rsd' as const,
    base_price_rsd: basePriceRsd,
    discount_percent: discountPercent,
    final_price_rsd_snapshot: Math.round(effectiveRsd * 100) / 100,
    drops_per_rsd_snapshot: dropsPerRsd,
  };
}

export async function createStoreItem(input: z.infer<typeof createStoreItemSchema>) {
  try {
    const validated = createStoreItemSchema.parse(input);
    const supabaseAdmin = getAdminClient();
    if (!supabaseAdmin) {
      return { success: false, error: 'Admin client not available. Check server environment variables.' };
    }

    let discountCols: Record<string, unknown> = {};
    let finalPriceDrops = validated.priceDrops;

    if (validated.priceCalcMode === 'discount_from_rsd') {
      if (!validated.basePriceRsd || validated.basePriceRsd <= 0) {
        return { success: false, error: 'Base price (RSD) is required for discount mode.' };
      }
      if (validated.discountPercent == null || validated.discountPercent < 0 || validated.discountPercent > 95) {
        return { success: false, error: 'Discount must be between 0% and 95%.' };
      }
      const dropsPerRsd = await resolveGymConversion(supabaseAdmin, validated.gymId);
      const fields = computeDiscountFields(validated.basePriceRsd, validated.discountPercent, dropsPerRsd);
      finalPriceDrops = fields.price_drops;
      discountCols = fields;
    }

    const isDiscount = validated.priceCalcMode === 'discount_from_rsd';
    const basePriceDrops = isDiscount && validated.basePriceRsd
      ? Math.round(validated.basePriceRsd * (await resolveGymConversion(supabaseAdmin, validated.gymId)))
      : undefined;
    const bandError = await validateRewardPriceBand(
      supabaseAdmin,
      validated.gymId,
      validated.rewardType,
      finalPriceDrops,
      { isDiscountMode: isDiscount, basePriceDrops },
    );
    if (bandError) return { success: false, error: bandError };

    const { data, error } = await (supabaseAdmin
      .from('rewards')
      .insert({
        gym_id: validated.gymId,
        name: validated.name,
        description: validated.description || null,
        price_drops: finalPriceDrops,
        stock: validated.stock ?? null,
        image_url: validated.imageUrl || null,
        reward_type: validated.rewardType,
        is_active: true,
        redemption_limit: validated.redemptionLimit,
        sponsor_name: validated.sponsorName || null,
        sponsor_logo: validated.sponsorLogo || null,
        available_from: availabilityToDb(validated.availableFrom),
        available_until: availabilityToDb(validated.availableUntil),
        ...discountCols,
      } as any) as any)
      .select()
      .single();

    if (error) throw error;

    revalidatePath(`/dashboard/gym/${validated.gymId}/store`);
    return { success: true, data };
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return { success: false, error: error.errors[0].message };
    }
    return { success: false, error: error.message };
  }
}

export async function updateStoreItem(
  itemId: string,
  gymId: string,
  input: Partial<z.infer<typeof createStoreItemSchema>>
) {
  try {
    const updateData: any = {};
    
    if (input.name !== undefined) updateData.name = input.name;
    if (input.description !== undefined) updateData.description = input.description;
    if (input.priceDrops !== undefined) updateData.price_drops = input.priceDrops;
    if (input.stock !== undefined) {
      updateData.stock =
        typeof input.stock === 'number' && Number.isNaN(input.stock) ? null : input.stock;
    }
    if (input.rewardType !== undefined) updateData.reward_type = input.rewardType;
    if (input.imageUrl !== undefined) updateData.image_url = input.imageUrl || null;
    if (input.redemptionLimit !== undefined) updateData.redemption_limit = input.redemptionLimit;
    if (input.sponsorName !== undefined) updateData.sponsor_name = input.sponsorName || null;
    if (input.sponsorLogo !== undefined) updateData.sponsor_logo = input.sponsorLogo || null;
    if (Object.prototype.hasOwnProperty.call(input, 'availableFrom')) {
      updateData.available_from = availabilityToDb(input.availableFrom);
    }
    if (Object.prototype.hasOwnProperty.call(input, 'availableUntil')) {
      updateData.available_until = availabilityToDb(input.availableUntil);
    }
    const supabaseAdmin = getAdminClient();
    if (!supabaseAdmin) {
      return { success: false, error: 'Admin client not available. Check server environment variables.' };
    }

    if (input.priceCalcMode === 'discount_from_rsd') {
      if (!input.basePriceRsd || input.basePriceRsd <= 0) {
        return { success: false, error: 'Base price (RSD) is required for discount mode.' };
      }
      if (input.discountPercent == null || input.discountPercent < 0 || input.discountPercent > 95) {
        return { success: false, error: 'Discount must be between 0% and 95%.' };
      }
      const dropsPerRsd = await resolveGymConversion(supabaseAdmin, gymId);
      const fields = computeDiscountFields(input.basePriceRsd, input.discountPercent, dropsPerRsd);
      updateData.price_drops = fields.price_drops;
      updateData.price_calc_mode = fields.price_calc_mode;
      updateData.base_price_rsd = fields.base_price_rsd;
      updateData.discount_percent = fields.discount_percent;
      updateData.final_price_rsd_snapshot = fields.final_price_rsd_snapshot;
      updateData.drops_per_rsd_snapshot = fields.drops_per_rsd_snapshot;
    } else if (input.priceCalcMode === 'manual_drops') {
      updateData.price_calc_mode = 'manual_drops';
      updateData.base_price_rsd = null;
      updateData.discount_percent = 0;
      updateData.final_price_rsd_snapshot = null;
      updateData.drops_per_rsd_snapshot = null;
    }

    const effectivePrice = updateData.price_drops ?? input.priceDrops;
    const isDiscountUpdate = input.priceCalcMode === 'discount_from_rsd';
    if (effectivePrice !== undefined || input.rewardType !== undefined) {
      const { data: existingReward } = await (supabaseAdmin.from('rewards') as any)
        .select('price_drops, reward_type')
        .eq('id', itemId)
        .eq('gym_id', gymId)
        .single();
      const rewardType = input.rewardType || (existingReward as any)?.reward_type || 'physical';
      const priceDrops = Number(
        effectivePrice !== undefined ? effectivePrice : (existingReward as any)?.price_drops || 0
      );
      const basePriceDrops = isDiscountUpdate && input.basePriceRsd
        ? Math.round(input.basePriceRsd * (await resolveGymConversion(supabaseAdmin, gymId)))
        : undefined;
      const bandError = await validateRewardPriceBand(supabaseAdmin, gymId, rewardType, priceDrops, {
        isDiscountMode: isDiscountUpdate,
        basePriceDrops,
      });
      if (bandError) return { success: false, error: bandError };
    }

    const { data, error } = await supabaseAdmin
      .from('rewards')
      // @ts-expect-error - Supabase type inference issue
      .update(updateData as any)
      .eq('id', itemId)
      .eq('gym_id', gymId)
      .select()
      .single();

    if (error) throw error;

    revalidatePath(`/dashboard/gym/${gymId}/store`);
    return { success: true, data };
  } catch (error: any) {
    console.error('Error updating store item:', error);
    return { success: false, error: error.message };
  }
}

export async function deleteStoreItem(itemId: string, gymId: string) {
  try {
    const supabaseAdmin = getAdminClient();
    if (!supabaseAdmin) {
      return { success: false, error: 'Admin client not available. Check server environment variables.' };
    }
    const { error } = await supabaseAdmin
      .from('rewards')
      .delete()
      .eq('id', itemId)
      .eq('gym_id', gymId);

    if (error) throw error;

    revalidatePath(`/dashboard/gym/${gymId}/store`);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function toggleStoreItemActive(itemId: string, gymId: string, isActive: boolean) {
  try {
    const supabaseAdmin = getAdminClient();
    if (!supabaseAdmin) {
      return { success: false, error: 'Admin client not available.' };
    }
    const { error } = await (supabaseAdmin.from('rewards') as any)
      .update({ is_active: isActive, updated_at: new Date().toISOString() })
      .eq('id', itemId)
      .eq('gym_id', gymId);

    if (error) throw error;

    revalidatePath(`/dashboard/gym/${gymId}/store`);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
