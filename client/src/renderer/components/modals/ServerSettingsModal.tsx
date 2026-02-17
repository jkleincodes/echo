import { useState, useEffect, FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { X, Shield, ShieldBan, Trash2, Loader2, Plus, Copy, Check, Webhook } from 'lucide-react';
import { api } from '../../lib/api';
import { useServerStore } from '../../stores/serverStore';
import Avatar from '../ui/Avatar';
import type { Role, Member, ServerBan, Webhook as WebhookType } from '../../../../../shared/types';
import { getServerUrl } from '../../lib/serverUrl';

type Tab = 'overview' | 'roles' | 'members' | 'bans' | 'webhooks';

const PERMISSION_OPTIONS = [
  { key: 'MANAGE_CHANNELS', label: 'Manage Channels' },
  { key: 'MANAGE_ROLES', label: 'Manage Roles' },
  { key: 'MANAGE_MEMBERS', label: 'Manage Members' },
  { key: 'KICK_MEMBERS', label: 'Kick Members' },
  { key: 'SEND_MESSAGES', label: 'Send Messages' },
  { key: 'MANAGE_MESSAGES', label: 'Manage Messages' },
];

interface Props {
  serverId: string;
  onClose: () => void;
}

export default function ServerSettingsModal({ serverId, onClose }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('overview');

  const tabs: { key: Tab; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'roles', label: 'Roles' },
    { key: 'members', label: 'Members' },
    { key: 'bans', label: 'Bans' },
    { key: 'webhooks', label: 'Webhooks' },
  ];

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={onClose}>
      <div
        className="flex h-[600px] w-[800px] overflow-hidden rounded-md bg-ec-bg-primary shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sidebar */}
        <div className="flex w-[200px] flex-col bg-ec-bg-secondary p-3">
          <h3 className="mb-3 px-2 text-xs font-bold uppercase text-ec-text-muted">
            Server Settings
          </h3>
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`mb-0.5 rounded px-2 py-1.5 text-left text-sm ${
                activeTab === tab.key
                  ? 'bg-ec-bg-modifier-selected text-ec-text-primary'
                  : 'text-ec-text-secondary hover:bg-ec-bg-modifier-hover hover:text-ec-text-primary'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex flex-1 flex-col">
          <div className="flex items-center justify-between border-b border-ec-bg-tertiary px-6 py-4">
            <h2 className="text-xl font-bold text-ec-text-primary">
              {tabs.find((t) => t.key === activeTab)?.label}
            </h2>
            <button onClick={onClose} className="text-ec-text-muted hover:text-ec-text-primary">
              <X size={24} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            {activeTab === 'overview' && <OverviewTab serverId={serverId} />}
            {activeTab === 'roles' && <RolesTab serverId={serverId} />}
            {activeTab === 'members' && <MembersTab serverId={serverId} />}
            {activeTab === 'bans' && <BansTab serverId={serverId} />}
            {activeTab === 'webhooks' && <WebhooksTab serverId={serverId} />}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/* ── Overview Tab ── */
const AFK_TIMEOUT_OPTIONS = [
  { value: 60, label: '1 minute' },
  { value: 300, label: '5 minutes' },
  { value: 900, label: '15 minutes' },
  { value: 1800, label: '30 minutes' },
  { value: 3600, label: '1 hour' },
];

function OverviewTab({ serverId }: { serverId: string }) {
  const servers = useServerStore((s) => s.servers);
  const channels = useServerStore((s) => s.channels);
  const updateServer = useServerStore((s) => s.updateServer);
  const server = servers.find((s) => s.id === serverId);
  const voiceChannels = channels.filter((c) => c.type === 'voice');

  const [name, setName] = useState(server?.name || '');
  const [description, setDescription] = useState(server?.description || '');
  const [afkChannelId, setAfkChannelId] = useState<string | null>(server?.afkChannelId ?? null);
  const [afkTimeout, setAfkTimeout] = useState(server?.afkTimeout ?? 300);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [iconFile, setIconFile] = useState<File | null>(null);
  const [iconPreview, setIconPreview] = useState<string | null>(null);

  const handleIconChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setIconFile(file);
      setIconPreview(URL.createObjectURL(file));
    }
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError('');
    setSuccess(false);
    try {
      // Upload icon if changed
      if (iconFile) {
        const formData = new FormData();
        formData.append('icon', iconFile);
        const iconRes = await api.patch(`/api/servers/${serverId}/icon`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        updateServer(iconRes.data.data);
        setIconFile(null);
      }

      const res = await api.patch(`/api/servers/${serverId}`, {
        name: name.trim(),
        description: description.trim() || null,
        afkChannelId,
        afkTimeout,
      });
      updateServer(res.data.data);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2000);
    } catch {
      setError('Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  const displayIcon = iconPreview || (server?.iconUrl ? (server.iconUrl.startsWith('http') ? server.iconUrl : `${getServerUrl()}${server.iconUrl}`) : null);

  return (
    <form onSubmit={handleSave}>
      {/* Server Icon */}
      <label className="mb-2 block text-xs font-bold uppercase text-ec-text-secondary">
        Server Icon
      </label>
      <div className="mb-4 flex items-center gap-4">
        <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-ec-bg-tertiary text-2xl font-bold text-ec-text-primary">
          {displayIcon ? (
            <img src={displayIcon} alt="Server icon" className="h-full w-full object-cover" />
          ) : (
            server?.name?.charAt(0).toUpperCase()
          )}
        </div>
        <label className="cursor-pointer rounded bg-ec-bg-tertiary px-3 py-1.5 text-sm text-ec-text-secondary hover:bg-ec-bg-modifier-hover">
          Upload Image
          <input type="file" accept="image/jpeg,image/png,image/gif,image/webp" onChange={handleIconChange} className="hidden" />
        </label>
      </div>

      <label className="mb-2 block text-xs font-bold uppercase text-ec-text-secondary">
        Server Name
      </label>
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
        className="mb-4 w-full rounded bg-ec-input-bg p-2.5 text-ec-text-primary outline-none focus:ring-2 focus:ring-accent"
      />

      <label className="mb-2 block text-xs font-bold uppercase text-ec-text-secondary">
        Description
      </label>
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Tell people what this server is about"
        rows={4}
        className="mb-4 w-full resize-none rounded bg-ec-input-bg p-2.5 text-ec-text-primary outline-none focus:ring-2 focus:ring-accent"
      />

      <label className="mb-2 block text-xs font-bold uppercase text-ec-text-secondary">
        AFK Channel
      </label>
      <select
        value={afkChannelId || ''}
        onChange={(e) => setAfkChannelId(e.target.value || null)}
        className="mb-4 w-full rounded bg-ec-input-bg p-2.5 text-ec-text-primary outline-none focus:ring-2 focus:ring-accent"
      >
        <option value="">No AFK Channel</option>
        {voiceChannels.map((ch) => (
          <option key={ch.id} value={ch.id}>
            {ch.name}
          </option>
        ))}
      </select>

      <label className="mb-2 block text-xs font-bold uppercase text-ec-text-secondary">
        AFK Timeout
      </label>
      <select
        value={afkTimeout}
        onChange={(e) => setAfkTimeout(Number(e.target.value))}
        className="mb-4 w-full rounded bg-ec-input-bg p-2.5 text-ec-text-primary outline-none focus:ring-2 focus:ring-accent"
      >
        {AFK_TIMEOUT_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>

      {error && <p className="mb-3 text-sm text-red-400">{error}</p>}
      {success && <p className="mb-3 text-sm text-green-400">Changes saved!</p>}

      <button
        type="submit"
        disabled={saving || !name.trim()}
        className="rounded bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-dark disabled:opacity-50"
      >
        {saving ? 'Saving...' : 'Save Changes'}
      </button>
    </form>
  );
}

/* ── Roles Tab ── */
function RolesTab({ serverId }: { serverId: string }) {
  const roles = useServerStore((s) => s.roles);

  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleColor, setNewRoleColor] = useState('#99aab5');
  const [newRolePermissions, setNewRolePermissions] = useState<Record<string, boolean>>({});
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');

  const togglePermission = (key: string) => {
    setNewRolePermissions((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleCreateRole = async (e: FormEvent) => {
    e.preventDefault();
    if (!newRoleName.trim()) return;
    setCreating(true);
    setError('');
    try {
      const permissions = Object.entries(newRolePermissions)
        .filter(([, v]) => v)
        .map(([k]) => k)
        .join(',');

      await api.post(`/api/servers/${serverId}/roles`, {
        name: newRoleName.trim(),
        color: newRoleColor,
        permissions: permissions || '',
      });

      // Refresh server details to get updated roles
      useServerStore.getState().fetchServerDetails(serverId);

      setNewRoleName('');
      setNewRoleColor('#99aab5');
      setNewRolePermissions({});
      setShowForm(false);
    } catch {
      setError('Failed to create role');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-ec-text-secondary">
          {roles.length} {roles.length === 1 ? 'role' : 'roles'}
        </p>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1.5 rounded bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-dark"
        >
          <Plus size={14} />
          New Role
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreateRole} className="mb-4 rounded-md bg-ec-bg-secondary p-4">
          <label className="mb-2 block text-xs font-bold uppercase text-ec-text-secondary">
            Role Name
          </label>
          <input
            type="text"
            value={newRoleName}
            onChange={(e) => setNewRoleName(e.target.value)}
            placeholder="New role"
            required
            autoFocus
            className="mb-3 w-full rounded bg-ec-input-bg p-2.5 text-ec-text-primary outline-none focus:ring-2 focus:ring-accent"
          />

          <label className="mb-2 block text-xs font-bold uppercase text-ec-text-secondary">
            Color
          </label>
          <div className="mb-3 flex items-center gap-2">
            <input
              type="color"
              value={newRoleColor}
              onChange={(e) => setNewRoleColor(e.target.value)}
              className="h-8 w-8 cursor-pointer rounded border-none bg-transparent"
            />
            <span className="text-sm text-ec-text-muted">{newRoleColor}</span>
          </div>

          <label className="mb-2 block text-xs font-bold uppercase text-ec-text-secondary">
            Permissions
          </label>
          <div className="mb-3 space-y-2">
            {PERMISSION_OPTIONS.map((perm) => (
              <label key={perm.key} className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={!!newRolePermissions[perm.key]}
                  onChange={() => togglePermission(perm.key)}
                  className="h-4 w-4 rounded border-ec-text-muted accent-accent"
                />
                <span className="text-sm text-ec-text-primary">{perm.label}</span>
              </label>
            ))}
          </div>

          {error && <p className="mb-3 text-sm text-red-400">{error}</p>}

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={creating || !newRoleName.trim()}
              className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-dark disabled:opacity-50"
            >
              {creating ? 'Creating...' : 'Create Role'}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded px-3 py-1.5 text-sm text-ec-text-secondary hover:underline"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="space-y-1">
        {roles.map((role: Role) => (
          <div
            key={role.id}
            className="flex items-center gap-3 rounded-md bg-ec-bg-secondary p-3"
          >
            <div
              className="h-3 w-3 rounded-full"
              style={{ backgroundColor: role.color || '#99aab5' }}
            />
            <span className="font-medium text-ec-text-primary">{role.name}</span>
            {role.permissions && (
              <div className="flex flex-wrap gap-1">
                {role.permissions.split(',').filter(Boolean).map((perm) => (
                  <span
                    key={perm}
                    className="rounded bg-ec-bg-tertiary px-1.5 py-0.5 text-[10px] text-ec-text-muted"
                  >
                    {perm}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
        {roles.length === 0 && (
          <p className="py-4 text-center text-sm text-ec-text-muted">No custom roles yet</p>
        )}
      </div>
    </div>
  );
}

/* ── Members Tab ── */
function MembersTab({ serverId }: { serverId: string }) {
  const members = useServerStore((s) => s.members);
  const removeMember = useServerStore((s) => s.removeMember);
  const fetchServerDetails = useServerStore((s) => s.fetchServerDetails);
  const roles = useServerStore((s) => s.roles);
  const [kickingId, setKickingId] = useState<string | null>(null);
  const [banningId, setBanningId] = useState<string | null>(null);
  const [banReason, setBanReason] = useState('');
  const [roleDropdownId, setRoleDropdownId] = useState<string | null>(null);

  const handleKick = async (member: Member) => {
    if (!confirm(`Kick ${member.user.displayName} from the server?`)) return;
    setKickingId(member.userId);
    try {
      await api.delete(`/api/servers/${serverId}/members/${member.userId}`);
      removeMember(member.userId);
    } catch {
      // kick failed
    } finally {
      setKickingId(null);
    }
  };

  const handleBanConfirm = async (member: Member) => {
    try {
      await api.post(`/api/servers/${serverId}/bans/${member.userId}`, { reason: banReason.trim() || null });
      removeMember(member.userId);
      setBanningId(null);
      setBanReason('');
    } catch {
      // ban failed
    }
  };

  const handleAssignRole = async (memberId: string, roleId: string) => {
    try {
      await api.post(`/api/servers/${serverId}/members/${memberId}/roles/${roleId}`);
      fetchServerDetails(serverId);
    } catch {
      // assign failed
    }
    setRoleDropdownId(null);
  };

  const handleRemoveRole = async (memberId: string, roleId: string) => {
    try {
      await api.delete(`/api/servers/${serverId}/members/${memberId}/roles/${roleId}`);
      fetchServerDetails(serverId);
    } catch {
      // remove failed
    }
  };

  const getRoleBadge = (member: Member) => {
    if (member.role === 'owner') return { name: 'Owner', color: '#e2b714' };
    if (member.role === 'admin') return { name: 'Admin', color: '#e74c3c' };
    return null;
  };

  const getMemberRoleIds = (member: Member): string[] => {
    return (member.memberRoles || []).map((mr) => mr.role.id);
  };

  return (
    <div>
      <p className="mb-4 text-sm text-ec-text-secondary">
        {members.length} {members.length === 1 ? 'member' : 'members'}
      </p>

      <div className="space-y-1">
        {members.map((member: Member) => {
          const badge = getRoleBadge(member);
          const assignedRoleIds = getMemberRoleIds(member);
          const availableRoles = roles.filter((r) => !assignedRoleIds.includes(r.id));

          return (
            <div
              key={member.id}
              className="rounded-md bg-ec-bg-secondary p-3"
            >
              <div className="flex items-center gap-3">
                <Avatar
                  username={member.user.username}
                  avatarUrl={member.user.avatarUrl}
                  size={36}
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-ec-text-primary">
                      {member.user.displayName}
                    </span>
                    {badge && (
                      <span
                        className="rounded px-1.5 py-0.5 text-[10px] font-semibold text-white"
                        style={{ backgroundColor: badge.color }}
                      >
                        {badge.name}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-ec-text-muted">{member.user.username}</p>
                  {/* Assigned roles */}
                  {member.memberRoles && member.memberRoles.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {member.memberRoles.map((mr) => (
                        <span
                          key={mr.role.id}
                          className="group inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium text-white"
                          style={{ backgroundColor: mr.role.color || '#99aab5' }}
                        >
                          {mr.role.name}
                          <button
                            onClick={() => handleRemoveRole(member.id, mr.role.id)}
                            className="hidden text-white/70 hover:text-white group-hover:inline"
                            title="Remove role"
                          >
                            <X size={10} />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {/* Assign role button */}
                  {roles.length > 0 && (
                    <div className="relative">
                      <button
                        onClick={() => setRoleDropdownId(roleDropdownId === member.id ? null : member.id)}
                        className="rounded p-1.5 text-ec-text-muted hover:bg-ec-bg-modifier-hover hover:text-ec-text-secondary"
                        title="Assign role"
                      >
                        <Shield size={16} />
                      </button>
                      {roleDropdownId === member.id && (
                        <div className="absolute right-0 top-full z-10 mt-1 w-44 rounded-md bg-ec-bg-tertiary py-1 shadow-lg">
                          {availableRoles.length === 0 ? (
                            <p className="px-3 py-2 text-xs text-ec-text-muted">All roles assigned</p>
                          ) : (
                            availableRoles.map((role) => (
                              <button
                                key={role.id}
                                onClick={() => handleAssignRole(member.id, role.id)}
                                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-ec-text-secondary hover:bg-ec-bg-modifier-hover"
                              >
                                <div
                                  className="h-2.5 w-2.5 rounded-full"
                                  style={{ backgroundColor: role.color || '#99aab5' }}
                                />
                                {role.name}
                              </button>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  {member.role === 'member' && (
                    <>
                      <button
                        onClick={() => { setBanningId(member.userId); setBanReason(''); }}
                        className="rounded p-1.5 text-ec-text-muted hover:bg-red-500/10 hover:text-red-400"
                        title="Ban member"
                      >
                        <ShieldBan size={16} />
                      </button>
                      <button
                        onClick={() => handleKick(member)}
                        disabled={kickingId === member.userId}
                        className="rounded p-1.5 text-ec-text-muted hover:bg-red-500/10 hover:text-red-400 disabled:opacity-50"
                        title="Kick member"
                      >
                        {kickingId === member.userId ? (
                          <Loader2 size={16} className="animate-spin" />
                        ) : (
                          <Trash2 size={16} />
                        )}
                      </button>
                    </>
                  )}
                </div>
              </div>
              {/* Inline ban confirmation */}
              {banningId === member.userId && (
                <div className="mt-2 flex items-center gap-2 rounded bg-ec-bg-primary p-2">
                  <input
                    type="text"
                    value={banReason}
                    onChange={(e) => setBanReason(e.target.value)}
                    placeholder="Reason (optional)"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleBanConfirm(member);
                      if (e.key === 'Escape') setBanningId(null);
                    }}
                    className="flex-1 rounded bg-ec-input-bg px-2 py-1 text-sm text-ec-text-primary outline-none"
                  />
                  <button
                    onClick={() => handleBanConfirm(member)}
                    className="rounded bg-red-500 px-3 py-1 text-xs font-medium text-white hover:bg-red-600"
                  >
                    Ban
                  </button>
                  <button
                    onClick={() => setBanningId(null)}
                    className="rounded px-2 py-1 text-xs text-ec-text-muted hover:text-ec-text-secondary"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Bans Tab ── */
function BansTab({ serverId }: { serverId: string }) {
  const [bans, setBans] = useState<ServerBan[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchBans = async () => {
      try {
        const res = await api.get(`/api/servers/${serverId}/bans`);
        setBans(res.data.data);
      } catch {
        // failed to fetch
      } finally {
        setLoading(false);
      }
    };
    fetchBans();
  }, [serverId]);

  const handleUnban = async (userId: string) => {
    if (!confirm('Unban this user?')) return;
    try {
      await api.delete(`/api/servers/${serverId}/bans/${userId}`);
      setBans((prev) => prev.filter((b) => b.userId !== userId));
    } catch {
      // unban failed
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 size={24} className="animate-spin text-ec-text-muted" />
      </div>
    );
  }

  return (
    <div>
      <p className="mb-4 text-sm text-ec-text-secondary">
        {bans.length} {bans.length === 1 ? 'ban' : 'bans'}
      </p>

      <div className="space-y-1">
        {bans.map((ban) => (
          <div
            key={ban.id}
            className="flex items-center gap-3 rounded-md bg-ec-bg-secondary p-3"
          >
            <Avatar
              username={ban.user?.displayName || ban.userId}
              avatarUrl={ban.user?.avatarUrl}
              size={36}
            />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium text-ec-text-primary">
                  {ban.user?.displayName || 'Unknown User'}
                </span>
                <span className="text-xs text-ec-text-muted">
                  {ban.user?.username}
                </span>
              </div>
              {ban.reason && (
                <p className="text-xs text-ec-text-muted">Reason: {ban.reason}</p>
              )}
              <p className="text-[10px] text-ec-text-muted">
                Banned {new Date(ban.createdAt).toLocaleDateString()}
              </p>
            </div>
            <button
              onClick={() => handleUnban(ban.userId)}
              className="rounded bg-ec-bg-tertiary px-3 py-1.5 text-xs font-medium text-ec-text-secondary hover:bg-ec-bg-modifier-hover"
            >
              Unban
            </button>
          </div>
        ))}
        {bans.length === 0 && (
          <p className="py-4 text-center text-sm text-ec-text-muted">No banned users</p>
        )}
      </div>
    </div>
  );
}

/* ── Webhooks Tab ── */
function WebhooksTab({ serverId }: { serverId: string }) {
  const channels = useServerStore((s) => s.channels);
  const textChannels = channels.filter((c) => c.type === 'text');

  const [webhooks, setWebhooks] = useState<WebhookType[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newChannelId, setNewChannelId] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editChannelId, setEditChannelId] = useState('');

  useEffect(() => {
    const fetchWebhooks = async () => {
      try {
        const res = await api.get(`/api/servers/${serverId}/webhooks`);
        setWebhooks(res.data.data);
      } catch {
        // failed to fetch
      } finally {
        setLoading(false);
      }
    };
    fetchWebhooks();
  }, [serverId]);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newChannelId) return;
    setCreating(true);
    setError('');
    try {
      const res = await api.post(`/api/servers/${serverId}/webhooks`, {
        name: newName.trim(),
        channelId: newChannelId,
      });
      setWebhooks((prev) => [res.data.data, ...prev]);
      setNewName('');
      setNewChannelId('');
      setShowForm(false);
    } catch {
      setError('Failed to create webhook');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (webhookId: string) => {
    if (!confirm('Delete this webhook? Messages it sent will remain.')) return;
    try {
      await api.delete(`/api/servers/${serverId}/webhooks/${webhookId}`);
      setWebhooks((prev) => prev.filter((w) => w.id !== webhookId));
    } catch {
      // delete failed
    }
  };

  const handleCopyUrl = (webhook: WebhookType) => {
    const url = `${getServerUrl()}/api/webhooks/${webhook.id}/${webhook.token}`;
    navigator.clipboard.writeText(url);
    setCopiedId(webhook.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleEditStart = (webhook: WebhookType) => {
    setEditingId(webhook.id);
    setEditName(webhook.name);
    setEditChannelId(webhook.channelId);
  };

  const handleEditSave = async (webhookId: string) => {
    try {
      const res = await api.patch(`/api/servers/${serverId}/webhooks/${webhookId}`, {
        name: editName.trim(),
        channelId: editChannelId,
      });
      setWebhooks((prev) => prev.map((w) => (w.id === webhookId ? res.data.data : w)));
      setEditingId(null);
    } catch {
      // edit failed
    }
  };

  const getChannelName = (channelId: string) => {
    return textChannels.find((c) => c.id === channelId)?.name || 'Unknown';
  };

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 size={24} className="animate-spin text-ec-text-muted" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-ec-text-secondary">
          {webhooks.length} {webhooks.length === 1 ? 'webhook' : 'webhooks'}
        </p>
        <button
          onClick={() => { setShowForm(!showForm); setNewChannelId(textChannels[0]?.id || ''); }}
          className="flex items-center gap-1.5 rounded bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-dark"
        >
          <Plus size={14} />
          New Webhook
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="mb-4 rounded-md bg-ec-bg-secondary p-4">
          <label className="mb-2 block text-xs font-bold uppercase text-ec-text-secondary">
            Name
          </label>
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="e.g. GitHub, CI/CD"
            required
            autoFocus
            maxLength={80}
            className="mb-3 w-full rounded bg-ec-input-bg p-2.5 text-ec-text-primary outline-none focus:ring-2 focus:ring-accent"
          />

          <label className="mb-2 block text-xs font-bold uppercase text-ec-text-secondary">
            Channel
          </label>
          <select
            value={newChannelId}
            onChange={(e) => setNewChannelId(e.target.value)}
            required
            className="mb-3 w-full rounded bg-ec-input-bg p-2.5 text-ec-text-primary outline-none focus:ring-2 focus:ring-accent"
          >
            {textChannels.map((ch) => (
              <option key={ch.id} value={ch.id}>
                #{ch.name}
              </option>
            ))}
          </select>

          {error && <p className="mb-3 text-sm text-red-400">{error}</p>}

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={creating || !newName.trim() || !newChannelId}
              className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-dark disabled:opacity-50"
            >
              {creating ? 'Creating...' : 'Create Webhook'}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded px-3 py-1.5 text-sm text-ec-text-secondary hover:underline"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="space-y-1">
        {webhooks.map((webhook) => (
          <div key={webhook.id} className="rounded-md bg-ec-bg-secondary p-3">
            {editingId === webhook.id ? (
              <div className="space-y-2">
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  maxLength={80}
                  className="w-full rounded bg-ec-input-bg p-2 text-sm text-ec-text-primary outline-none focus:ring-2 focus:ring-accent"
                />
                <select
                  value={editChannelId}
                  onChange={(e) => setEditChannelId(e.target.value)}
                  className="w-full rounded bg-ec-input-bg p-2 text-sm text-ec-text-primary outline-none focus:ring-2 focus:ring-accent"
                >
                  {textChannels.map((ch) => (
                    <option key={ch.id} value={ch.id}>
                      #{ch.name}
                    </option>
                  ))}
                </select>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleEditSave(webhook.id)}
                    className="rounded bg-accent px-3 py-1 text-xs font-medium text-white hover:bg-accent-dark"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setEditingId(null)}
                    className="rounded px-3 py-1 text-xs text-ec-text-secondary hover:underline"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-accent/20 text-accent">
                  <Webhook size={18} />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-ec-text-primary">{webhook.name}</span>
                    <span className="rounded bg-accent/80 px-1 py-0.5 text-[9px] font-bold leading-none text-white">
                      BOT
                    </span>
                  </div>
                  <p className="text-xs text-ec-text-muted">
                    #{getChannelName(webhook.channelId)} &middot; Created {new Date(webhook.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleCopyUrl(webhook)}
                    className="rounded p-1.5 text-ec-text-muted hover:bg-ec-bg-modifier-hover hover:text-ec-text-secondary"
                    title="Copy Webhook URL"
                  >
                    {copiedId === webhook.id ? <Check size={16} className="text-green-400" /> : <Copy size={16} />}
                  </button>
                  <button
                    onClick={() => handleEditStart(webhook)}
                    className="rounded p-1.5 text-ec-text-muted hover:bg-ec-bg-modifier-hover hover:text-ec-text-secondary"
                    title="Edit"
                  >
                    <Webhook size={16} />
                  </button>
                  <button
                    onClick={() => handleDelete(webhook.id)}
                    className="rounded p-1.5 text-ec-text-muted hover:bg-red-500/10 hover:text-red-400"
                    title="Delete"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
        {webhooks.length === 0 && (
          <p className="py-4 text-center text-sm text-ec-text-muted">No webhooks yet</p>
        )}
      </div>
    </div>
  );
}
