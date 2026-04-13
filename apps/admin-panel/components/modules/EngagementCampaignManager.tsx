'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import {
  Bell, Send, Clock, CheckCircle, XCircle,
  Users, Loader2, Megaphone, Gift, Link2,
} from 'lucide-react';
import {
  getAtRiskMembers,
  createCampaign,
  queueCampaign,
  getGymCampaigns,
  type AtRiskMember,
  type Campaign,
} from '@/lib/actions/engagement-actions';
import { MemberAvatar } from '@/components/MemberAvatar';
import { confirmAction } from '@/components/ui/ConfirmDialog';

interface EngagementCampaignManagerProps {
  gymId: string;
}

const SEGMENT_OPTIONS = [
  { value: 7, label: 'Inactive 7+ days' },
  { value: 14, label: 'Inactive 14+ days' },
  { value: 30, label: 'Inactive 30+ days' },
];

const TEMPLATE_OPTIONS = [
  { value: 'reminder', label: 'Reminder', icon: Bell, defaultTitle: 'We miss you!', defaultBody: "It's been a while since your last workout. Come back and keep your streak going!" },
  { value: 'offer', label: 'Comeback Offer', icon: Gift, defaultTitle: 'Special offer for you!', defaultBody: 'We have a special reward waiting for you. Come check it out at the front desk!' },
];

const DEEP_LINK_OPTIONS = [
  { value: '', label: 'None (open app)' },
  { value: '/home', label: 'Home screen' },
  { value: '/store', label: 'Reward store' },
  { value: '/challenges', label: 'Challenges' },
];

const STATUS_CONFIG: Record<string, { label: string; cls: string; icon: typeof Clock }> = {
  draft: { label: 'Draft', cls: 'bg-zinc-800 text-zinc-400 border-zinc-700/50', icon: Clock },
  queued: { label: 'Queued', cls: 'bg-amber-500/10 text-amber-400 border-amber-500/20', icon: Clock },
  sending: { label: 'Sending', cls: 'bg-blue-500/10 text-blue-400 border-blue-500/20', icon: Loader2 },
  sent: { label: 'Sent', cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', icon: CheckCircle },
  failed: { label: 'Failed', cls: 'bg-red-500/10 text-red-400 border-red-500/20', icon: XCircle },
  cancelled: { label: 'Cancelled', cls: 'bg-zinc-800 text-zinc-500 border-zinc-700/50', icon: XCircle },
};

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function EngagementCampaignManager({ gymId }: EngagementCampaignManagerProps) {
  const [tab, setTab] = useState<'create' | 'history'>('create');
  const [segment, setSegment] = useState(14);
  const [atRisk, setAtRisk] = useState<AtRiskMember[]>([]);
  const [atRiskLoading, setAtRiskLoading] = useState(false);
  const [atRiskCount, setAtRiskCount] = useState(0);

  const [template, setTemplate] = useState('reminder');
  const [title, setTitle] = useState(TEMPLATE_OPTIONS[0].defaultTitle);
  const [body, setBody] = useState(TEMPLATE_OPTIONS[0].defaultBody);
  const [deepLink, setDeepLink] = useState('');
  const [creating, setCreating] = useState(false);

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [campaignsLoading, setCampaignsLoading] = useState(true);
  const [queuingId, setQueuingId] = useState<string | null>(null);

  const fetchAtRisk = useCallback(async () => {
    setAtRiskLoading(true);
    const res = await getAtRiskMembers(gymId, segment);
    if (res.success && res.data) {
      setAtRisk(res.data.members);
      setAtRiskCount(res.data.count);
    } else {
      toast.error(res.error || 'Failed to load at-risk members');
    }
    setAtRiskLoading(false);
  }, [gymId, segment]);

  const fetchCampaigns = useCallback(async () => {
    setCampaignsLoading(true);
    const res = await getGymCampaigns(gymId);
    if (res.success && res.data) setCampaigns(res.data);
    setCampaignsLoading(false);
  }, [gymId]);

  useEffect(() => { fetchAtRisk(); }, [fetchAtRisk]);
  useEffect(() => { fetchCampaigns(); }, [fetchCampaigns]);

  const handleTemplateChange = (val: string) => {
    setTemplate(val);
    const tpl = TEMPLATE_OPTIONS.find((t) => t.value === val);
    if (tpl) {
      setTitle(tpl.defaultTitle);
      setBody(tpl.defaultBody);
    }
  };

  const handleCreate = async () => {
    if (!title.trim() || !body.trim()) {
      toast.error('Title and message body are required');
      return;
    }
    setCreating(true);
    const res = await createCampaign({
      gymId,
      campaignType: template,
      title: title.trim(),
      body: body.trim(),
      deepLink: deepLink || null,
      audienceType: 'inactive',
      audienceParams: { days_inactive: segment },
    });
    if (res.success && res.data) {
      toast.success(`Campaign created — ${res.data.target_count} members targeted`);
      fetchCampaigns();
      setTab('history');
    } else {
      toast.error(res.error || 'Failed to create campaign');
    }
    setCreating(false);
  };

  const handleQueue = async (campaign: Campaign) => {
    if (!(await confirmAction({
      title: 'Send Campaign',
      message: `This will send push notifications to ${campaign.target_count} members. Continue?`,
      confirmLabel: 'Send Now',
    }))) return;

    setQueuingId(campaign.id);
    const res = await queueCampaign(campaign.id, gymId);
    if (res.success) {
      toast.success(`${res.data?.queued_deliveries ?? 0} notifications queued for delivery`);
      fetchCampaigns();
    } else {
      toast.error(res.error || 'Failed to queue');
    }
    setQueuingId(null);
  };

  const pushReady = atRisk.filter((m) => m.has_push_token).length;

  return (
    <div className="space-y-5">
      {/* Tabs */}
      <div className="flex gap-1 bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-1">
        {[
          { key: 'create' as const, label: 'New Campaign', icon: Megaphone },
          { key: 'history' as const, label: 'Campaign History', icon: Clock },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
              tab === t.key ? 'bg-[#00E5FF]/10 text-[#00E5FF]' : 'text-zinc-500 hover:text-white'
            }`}
          >
            <t.icon className="w-3.5 h-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'create' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Left: Form */}
          <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-5 space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-white mb-3">Target Segment</h3>
              <div className="flex gap-2">
                {SEGMENT_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setSegment(opt.value)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                      segment === opt.value
                        ? 'bg-[#00E5FF]/10 text-[#00E5FF] border-[#00E5FF]/20'
                        : 'bg-[#111] text-zinc-500 border-[#1A1A1A] hover:text-white'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-zinc-600 mt-2">
                {atRiskLoading ? 'Loading…' : `${atRiskCount} members match · ${pushReady} with push enabled`}
              </p>
            </div>

            <div>
              <label className="text-xs font-medium text-zinc-400 mb-1.5 block">Template</label>
              <div className="flex gap-2">
                {TEMPLATE_OPTIONS.map((tpl) => (
                  <button
                    key={tpl.value}
                    onClick={() => handleTemplateChange(tpl.value)}
                    className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${
                      template === tpl.value
                        ? 'bg-[#00E5FF]/10 text-[#00E5FF] border-[#00E5FF]/20'
                        : 'bg-[#111] text-zinc-500 border-[#1A1A1A] hover:text-white'
                    }`}
                  >
                    <tpl.icon className="w-3.5 h-3.5" />
                    {tpl.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-zinc-400 mb-1.5 block">Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3 py-2 bg-[#111] border border-[#1A1A1A] rounded-lg text-sm text-white placeholder-zinc-600 focus:border-[#00E5FF] focus:outline-none"
                placeholder="Notification title"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-zinc-400 mb-1.5 block">Message</label>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 bg-[#111] border border-[#1A1A1A] rounded-lg text-sm text-white placeholder-zinc-600 focus:border-[#00E5FF] focus:outline-none resize-none"
                placeholder="Notification body"
              />
            </div>

            <div>
              <label className="flex items-center gap-1.5 text-xs font-medium text-zinc-400 mb-1.5">
                <Link2 className="w-3 h-3" />
                Deep Link
              </label>
              <select
                value={deepLink}
                onChange={(e) => setDeepLink(e.target.value)}
                className="w-full px-3 py-2 bg-[#111] border border-[#1A1A1A] rounded-lg text-sm text-white focus:border-[#00E5FF] focus:outline-none"
              >
                {DEEP_LINK_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            <button
              onClick={handleCreate}
              disabled={creating || atRiskCount === 0}
              className="w-full px-4 py-2.5 bg-[#00E5FF] text-black rounded-lg text-sm font-bold hover:bg-[#00B8CC] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              Create Campaign Draft
            </button>
          </div>

          {/* Right: Preview */}
          <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-5">
            <h3 className="text-sm font-semibold text-white mb-3">At-risk Members Preview</h3>
            {atRiskLoading ? (
              <div className="flex justify-center py-10">
                <Loader2 className="w-5 h-5 text-zinc-500 animate-spin" />
              </div>
            ) : atRisk.length === 0 ? (
              <div className="text-center py-10">
                <Users className="w-8 h-8 text-zinc-700 mx-auto mb-2" />
                <p className="text-sm text-zinc-500">No at-risk members found</p>
                <p className="text-[10px] text-zinc-600 mt-1">All members have been active recently</p>
              </div>
            ) : (
              <div className="space-y-1.5 max-h-[400px] overflow-y-auto">
                {atRisk.slice(0, 20).map((m) => (
                  <div key={m.user_id} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-[#111]/50">
                    <MemberAvatar avatarUrl={m.avatar_url} username={m.username} size="sm" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-white font-medium truncate">{m.username || m.full_name || 'Member'}</p>
                      <p className="text-[10px] text-zinc-600">{m.days_inactive}d inactive · {m.total_checkins} check-ins</p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {m.has_push_token ? (
                        <span className="text-[9px] text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">Push</span>
                      ) : (
                        <span className="text-[9px] text-zinc-600 bg-zinc-800 px-1.5 py-0.5 rounded">No push</span>
                      )}
                    </div>
                  </div>
                ))}
                {atRisk.length > 20 && (
                  <p className="text-[10px] text-zinc-600 text-center pt-2">+{atRisk.length - 20} more members</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'history' && (
        <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-[#1A1A1A]">
            <h3 className="text-sm font-semibold text-white">Campaign History</h3>
            <p className="text-[10px] text-zinc-500 mt-0.5">Recent campaigns and delivery stats</p>
          </div>

          {campaignsLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="w-5 h-5 text-zinc-500 animate-spin" />
            </div>
          ) : campaigns.length === 0 ? (
            <div className="text-center py-10">
              <Megaphone className="w-8 h-8 text-zinc-700 mx-auto mb-2" />
              <p className="text-sm text-zinc-500">No campaigns yet</p>
            </div>
          ) : (
            <div className="divide-y divide-[#1A1A1A]">
              {campaigns.map((c) => {
                const status = STATUS_CONFIG[c.status] || STATUS_CONFIG.draft;
                const StatusIcon = status.icon;
                return (
                  <div key={c.id} className="px-5 py-3 flex items-center gap-4">
                    <div className="w-9 h-9 rounded-lg bg-[#111] flex items-center justify-center shrink-0">
                      {c.campaign_type === 'offer' ? (
                        <Gift className="w-4 h-4 text-amber-400" />
                      ) : (
                        <Bell className="w-4 h-4 text-[#00E5FF]" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white font-medium truncate">{c.title}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] text-zinc-600">{formatDate(c.created_at)}</span>
                        <span className="text-[10px] text-zinc-600">·</span>
                        <span className="text-[10px] text-zinc-500">{c.target_count} targets</span>
                        {c.sent_count > 0 && (
                          <>
                            <span className="text-[10px] text-zinc-600">·</span>
                            <span className="text-[10px] text-emerald-400">{c.sent_count} sent</span>
                          </>
                        )}
                        {c.failed_count > 0 && (
                          <>
                            <span className="text-[10px] text-zinc-600">·</span>
                            <span className="text-[10px] text-red-400">{c.failed_count} failed</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${status.cls}`}>
                        <StatusIcon className="w-3 h-3" />
                        {status.label}
                      </span>
                      {c.status === 'draft' && (
                        <button
                          onClick={() => handleQueue(c)}
                          disabled={queuingId === c.id}
                          className="px-3 py-1.5 text-xs font-medium text-[#00E5FF] bg-[#00E5FF]/10 border border-[#00E5FF]/20 rounded-lg hover:bg-[#00E5FF]/20 transition-colors disabled:opacity-50 flex items-center gap-1.5"
                        >
                          {queuingId === c.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                          Send
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
