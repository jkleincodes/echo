import { useState, useEffect, useRef, useCallback, FormEvent, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X, Upload, ImagePlus, Trash2, LogOut } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuthStore } from '../../stores/authStore';
import { useAudioSettingsStore } from '../../stores/audioSettingsStore';
import { voiceService } from '../../services/voiceService';
import Avatar from '../ui/Avatar';
import ImageCropModal from './ImageCropModal';
import { getServerUrl } from '../../lib/serverUrl';

type Tab = 'account' | 'security' | 'voice' | 'video';

interface Props {
  onClose: () => void;
}

export default function UserSettingsModal({ onClose }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('account');
  const logout = useAuthStore((s) => s.logout);

  const tabs: { key: Tab; label: string }[] = [
    { key: 'account', label: 'My Account' },
    { key: 'security', label: 'Security' },
    { key: 'voice', label: 'Voice & Audio' },
    { key: 'video', label: 'Video' },
  ];

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={onClose}>
      <div
        className="flex h-[80vh] w-[85vw] max-h-[900px] max-w-[1200px] min-h-[400px] min-w-[600px] overflow-hidden rounded-md bg-ec-bg-primary shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sidebar */}
        <div className="flex w-[200px] flex-col bg-ec-bg-secondary p-3">
          <h3 className="mb-3 px-2 text-xs font-bold uppercase text-ec-text-muted">
            User Settings
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
          <div className="my-2 h-px bg-ec-bg-tertiary" />
          <button
            onClick={logout}
            className="flex items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-red hover:bg-ec-bg-modifier-hover"
          >
            <LogOut size={14} />
            Log Out
          </button>
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
            {activeTab === 'account' && <AccountTab />}
            {activeTab === 'security' && <SecurityTab />}
            {activeTab === 'voice' && <VoiceAudioTab />}
            {activeTab === 'video' && <VideoTab />}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/* ── Profile Preview Card ── */
function ProfilePreviewCard({
  username,
  displayName,
  avatarUrl,
  bannerColor,
  bannerUrl,
  bio,
  customStatus,
  pronouns,
}: {
  username: string;
  displayName: string;
  avatarUrl: string | null;
  bannerColor: string;
  bannerUrl: string | null;
  bio: string;
  customStatus: string;
  pronouns: string;
}) {
  return (
    <div className="w-[260px] shrink-0 overflow-hidden rounded-md bg-ec-bg-secondary">
      {/* Banner */}
      <div
        className="h-[60px] bg-cover bg-center"
        style={
          bannerUrl
            ? { backgroundImage: `url(${bannerUrl.startsWith('http') || bannerUrl.startsWith('blob:') ? bannerUrl : getServerUrl() + bannerUrl})` }
            : { backgroundColor: bannerColor || '#0ea5e9' }
        }
      />
      {/* Avatar */}
      <div className="relative px-3">
        <div className="absolute -top-[24px]">
          <div className="rounded-full border-[4px] border-ec-bg-secondary">
            <Avatar username={username} avatarUrl={avatarUrl} size={48} />
          </div>
        </div>
      </div>
      {/* Info */}
      <div className="px-3 pb-3 pt-8">
        <div className="rounded-md bg-ec-bg-tertiary p-2.5">
          <p className="text-sm font-bold text-ec-text-primary">
            {displayName || username}
          </p>
          <p className="text-xs text-ec-text-secondary">{username}</p>
          {pronouns && (
            <p className="text-[11px] text-ec-text-muted">{pronouns}</p>
          )}
          {customStatus && (
            <p className="mt-1.5 text-xs text-ec-text-primary">{customStatus}</p>
          )}
          {bio && (
            <>
              <div className="my-1.5 h-px bg-ec-bg-secondary" />
              <p className="text-[11px] font-bold uppercase text-ec-text-secondary">About Me</p>
              <p className="mt-0.5 whitespace-pre-wrap text-xs text-ec-text-primary">{bio}</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Account Tab (migrated from EditProfileModal) ── */
function AccountTab() {
  const user = useAuthStore((s) => s.user);
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [customStatus, setCustomStatus] = useState(user?.customStatus || '');
  const [bannerColor, setBannerColor] = useState(user?.bannerColor || '#0ea5e9');
  const [pronouns, setPronouns] = useState(user?.pronouns || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  // Avatar: deferred upload
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(user?.avatarUrl || null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Banner: deferred upload/remove
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [bannerPreview, setBannerPreview] = useState<string | null>(user?.bannerUrl || null);
  const [pendingBannerRemove, setPendingBannerRemove] = useState(false);
  const bannerInputRef = useRef<HTMLInputElement>(null);

  // Image crop modal state
  const [cropModalOpen, setCropModalOpen] = useState(false);
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);
  const [cropTarget, setCropTarget] = useState<'avatar' | 'banner'>('avatar');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) return;
    setSaving(true);
    setError('');
    setSuccess(false);
    try {
      // Upload avatar if a new file was selected
      if (avatarFile) {
        const formData = new FormData();
        formData.append('avatar', avatarFile);
        const avatarRes = await api.post('/api/users/me/avatar', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        setAvatarPreview(avatarRes.data.data.avatarUrl);
        setAvatarFile(null);
        useAuthStore.setState({ user: avatarRes.data.data });
      }

      // Upload or remove banner if changed
      if (bannerFile) {
        const formData = new FormData();
        formData.append('banner', bannerFile);
        const bannerRes = await api.post('/api/users/me/banner', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        setBannerPreview(bannerRes.data.data.bannerUrl);
        setBannerFile(null);
        useAuthStore.setState({ user: bannerRes.data.data });
      } else if (pendingBannerRemove) {
        const bannerRes = await api.post('/api/users/me/banner');
        setBannerPreview(bannerRes.data.data.bannerUrl);
        setPendingBannerRemove(false);
        useAuthStore.setState({ user: bannerRes.data.data });
      }

      const res = await api.patch('/api/users/me', {
        displayName: displayName.trim(),
        bio: bio.trim() || null,
        customStatus: customStatus.trim() || null,
        bannerColor,
        pronouns: pronouns.trim() || null,
      });
      useAuthStore.setState({ user: res.data.data });
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2000);
    } catch {
      setError('Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setCropImageSrc(URL.createObjectURL(file));
      setCropTarget('avatar');
      setCropModalOpen(true);
    }
    e.target.value = '';
  };

  const handleBannerFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setCropImageSrc(URL.createObjectURL(file));
      setCropTarget('banner');
      setCropModalOpen(true);
    }
    e.target.value = '';
  };

  const handleCropConfirm = (blob: Blob) => {
    const file = new File([blob], `${cropTarget}.png`, { type: 'image/png' });
    const previewUrl = URL.createObjectURL(blob);
    if (cropTarget === 'avatar') {
      setAvatarFile(file);
      setAvatarPreview(previewUrl);
    } else {
      setBannerFile(file);
      setBannerPreview(previewUrl);
      setPendingBannerRemove(false);
    }
    if (cropImageSrc) URL.revokeObjectURL(cropImageSrc);
    setCropModalOpen(false);
    setCropImageSrc(null);
  };

  const handleCropCancel = () => {
    if (cropImageSrc) URL.revokeObjectURL(cropImageSrc);
    setCropModalOpen(false);
    setCropImageSrc(null);
  };

  const handleRemoveBanner = () => {
    setBannerFile(null);
    setBannerPreview(null);
    setPendingBannerRemove(true);
  };

  return (
    <div className="flex gap-6">
      {/* Left column — edit form */}
      <form onSubmit={handleSubmit} className="min-w-0 flex-1">
        {/* Avatar section */}
        <div className="mb-4 flex items-center gap-4">
          <Avatar username={user?.username || ''} avatarUrl={avatarPreview} size={64} />
          <div>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 rounded bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-dark"
            >
              <Upload size={14} />
              Upload Avatar
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="hidden"
            />
            <p className="mt-1 text-xs text-ec-text-muted">JPG, PNG, or GIF. Max 8MB.</p>
          </div>
        </div>

        {/* Banner image section */}
        <label className="mb-2 block text-xs font-bold uppercase text-ec-text-secondary">
          Banner Image
        </label>
        <div className="mb-4 flex items-center gap-2">
          <button
            type="button"
            onClick={() => bannerInputRef.current?.click()}
            className="flex items-center gap-1.5 rounded bg-ec-bg-tertiary px-3 py-1.5 text-sm font-medium text-ec-text-primary hover:bg-ec-bg-modifier-hover"
          >
            <ImagePlus size={14} />
            Upload Banner
          </button>
          {bannerPreview && (
            <button
              type="button"
              onClick={handleRemoveBanner}
              className="flex items-center gap-1.5 rounded bg-red-500/10 px-3 py-1.5 text-sm font-medium text-red-400 hover:bg-red-500/20"
            >
              <Trash2 size={14} />
              Remove
            </button>
          )}
          <input
            ref={bannerInputRef}
            type="file"
            accept="image/*"
            onChange={handleBannerFileChange}
            className="hidden"
          />
        </div>

        <label className="mb-2 block text-xs font-bold uppercase text-ec-text-secondary">
          Display Name
        </label>
        <input
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          required
          className="mb-4 w-full rounded bg-ec-input-bg p-2.5 text-ec-text-primary outline-none focus:ring-2 focus:ring-accent"
        />

        <label className="mb-2 block text-xs font-bold uppercase text-ec-text-secondary">
          Pronouns
        </label>
        <input
          type="text"
          value={pronouns}
          onChange={(e) => setPronouns(e.target.value)}
          placeholder="e.g. he/him, she/her, they/them"
          maxLength={40}
          className="mb-4 w-full rounded bg-ec-input-bg p-2.5 text-ec-text-primary outline-none focus:ring-2 focus:ring-accent"
        />

        <label className="mb-2 block text-xs font-bold uppercase text-ec-text-secondary">
          Custom Status
        </label>
        <input
          type="text"
          value={customStatus}
          onChange={(e) => setCustomStatus(e.target.value)}
          placeholder="What are you up to?"
          className="mb-4 w-full rounded bg-ec-input-bg p-2.5 text-ec-text-primary outline-none focus:ring-2 focus:ring-accent"
        />

        <label className="mb-2 block text-xs font-bold uppercase text-ec-text-secondary">
          Bio
        </label>
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          placeholder="Tell us about yourself"
          rows={3}
          className="mb-4 w-full resize-none rounded bg-ec-input-bg p-2.5 text-ec-text-primary outline-none focus:ring-2 focus:ring-accent"
        />

        <label className="mb-2 block text-xs font-bold uppercase text-ec-text-secondary">
          Banner Color
        </label>
        <div className="mb-4 flex items-center gap-3">
          <input
            type="color"
            value={bannerColor}
            onChange={(e) => setBannerColor(e.target.value)}
            className="h-10 w-10 cursor-pointer rounded border-none bg-transparent"
          />
          <div className="h-10 flex-1 rounded" style={{ backgroundColor: bannerColor }} />
        </div>

        {error && <p className="mb-3 text-sm text-red-400">{error}</p>}
        {success && <p className="mb-3 text-sm text-green-400">Changes saved!</p>}

        <button
          type="submit"
          disabled={saving || !displayName.trim()}
          className="rounded bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-dark disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </form>

      {/* Right column — live preview */}
      <div className="shrink-0">
        <p className="mb-2 text-xs font-bold uppercase text-ec-text-secondary">Preview</p>
        <ProfilePreviewCard
          username={user?.username || ''}
          displayName={displayName}
          avatarUrl={avatarPreview}
          bannerColor={bannerColor}
          bannerUrl={bannerPreview}
          bio={bio}
          customStatus={customStatus}
          pronouns={pronouns}
        />
      </div>

      {cropModalOpen && cropImageSrc && (
        <ImageCropModal
          imageSrc={cropImageSrc}
          cropShape={cropTarget === 'avatar' ? 'round' : 'rect'}
          aspect={cropTarget === 'avatar' ? 1 : 5}
          onConfirm={handleCropConfirm}
          onCancel={handleCropCancel}
        />
      )}
    </div>
  );
}

/* ── Security Tab ── */
function SecurityTab() {
  const user = useAuthStore((s) => s.user);
  const [email, setEmail] = useState(user?.email || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [emailSuccess, setEmailSuccess] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);

  // Re-fetch user data on mount so verification status is current
  useEffect(() => {
    api.get('/api/auth/me').then((res) => {
      useAuthStore.setState({ user: res.data.data });
    }).catch(() => {});
  }, []);

  // Sync local state when store user changes
  useEffect(() => {
    setEmail(user?.email || '');
  }, [user?.email]);

  // 2FA state
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(!!user?.twoFactorEnabled);

  useEffect(() => {
    setTwoFactorEnabled(!!user?.twoFactorEnabled);
  }, [user?.twoFactorEnabled]);

  const [setupStep, setSetupStep] = useState<'idle' | 'qr' | 'recovery'>('idle');
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [manualSecret, setManualSecret] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [disableCode, setDisableCode] = useState('');
  const [disablePassword, setDisablePassword] = useState('');
  const [twoFaError, setTwoFaError] = useState('');
  const [twoFaLoading, setTwoFaLoading] = useState(false);

  const handleEmailSave = async () => {
    setEmailSaving(true);
    setEmailError('');
    setEmailSuccess('');
    try {
      const res = await api.patch('/api/users/me', { email: email.trim() || null });
      useAuthStore.setState({ user: res.data.data });
      setEmailSuccess(email.trim() ? 'Verification email sent!' : 'Email removed');
      setTimeout(() => setEmailSuccess(''), 3000);
    } catch (err: any) {
      setEmailError(err.response?.data?.error || 'Failed to update email');
    } finally {
      setEmailSaving(false);
    }
  };

  const handleResendVerification = async () => {
    try {
      await api.post('/api/auth/resend-verification');
      setEmailSuccess('Verification email sent!');
      setTimeout(() => setEmailSuccess(''), 3000);
    } catch (err: any) {
      setEmailError(err.response?.data?.error || 'Failed to send');
    }
  };

  const handlePasswordChange = async (e: FormEvent) => {
    e.preventDefault();
    setPasswordSaving(true);
    setPasswordError('');
    setPasswordSuccess(false);
    try {
      await api.post('/api/auth/change-password', { currentPassword, newPassword });
      setPasswordSuccess(true);
      setCurrentPassword('');
      setNewPassword('');
      setTimeout(() => setPasswordSuccess(false), 3000);
    } catch (err: any) {
      setPasswordError(err.response?.data?.error || 'Failed to change password');
    } finally {
      setPasswordSaving(false);
    }
  };

  const handleSetup2FA = async () => {
    setTwoFaLoading(true);
    setTwoFaError('');
    try {
      const res = await api.post('/api/auth/totp/setup');
      setQrCodeUrl(res.data.data.qrCodeDataUrl);
      setManualSecret(res.data.data.secret);
      setSetupStep('qr');
    } catch (err: any) {
      setTwoFaError(err.response?.data?.error || 'Failed to start setup');
    } finally {
      setTwoFaLoading(false);
    }
  };

  const handleEnable2FA = async () => {
    setTwoFaLoading(true);
    setTwoFaError('');
    try {
      const res = await api.post('/api/auth/totp/enable', { code: totpCode });
      setRecoveryCodes(res.data.data.recoveryCodes);
      setTwoFactorEnabled(true);
      setSetupStep('recovery');
      setTotpCode('');
      // Update user in store
      const meRes = await api.get('/api/auth/me');
      useAuthStore.setState({ user: meRes.data.data });
    } catch (err: any) {
      setTwoFaError(err.response?.data?.error || 'Invalid code');
    } finally {
      setTwoFaLoading(false);
    }
  };

  const handleDisable2FA = async () => {
    setTwoFaLoading(true);
    setTwoFaError('');
    try {
      await api.post('/api/auth/totp/disable', { code: disableCode, password: disablePassword });
      setTwoFactorEnabled(false);
      setDisableCode('');
      setDisablePassword('');
      const meRes = await api.get('/api/auth/me');
      useAuthStore.setState({ user: meRes.data.data });
    } catch (err: any) {
      setTwoFaError(err.response?.data?.error || 'Failed to disable');
    } finally {
      setTwoFaLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Email Section */}
      <div>
        <h3 className="mb-3 text-sm font-bold uppercase text-ec-text-secondary">Email</h3>
        <div className="flex gap-3">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="flex-1 rounded bg-ec-input-bg p-2.5 text-ec-text-primary outline-none focus:ring-2 focus:ring-accent"
          />
          <button
            onClick={handleEmailSave}
            disabled={emailSaving}
            className="rounded bg-accent px-4 py-2.5 text-sm font-medium text-white hover:bg-accent-dark disabled:opacity-50"
          >
            {emailSaving ? 'Saving...' : 'Save'}
          </button>
        </div>
        {user?.email && user?.emailVerified && (
          <p className="mt-1 text-xs text-green-400">Verified</p>
        )}
        {user?.email && !user?.emailVerified && (
          <p className="mt-1 text-xs text-yellow-400">
            Not verified —{' '}
            <button onClick={handleResendVerification} className="text-ec-text-link hover:underline">
              resend
            </button>
          </p>
        )}
        {emailError && <p className="mt-1 text-sm text-red-400">{emailError}</p>}
        {emailSuccess && <p className="mt-1 text-sm text-green-400">{emailSuccess}</p>}
      </div>

      <div className="h-px bg-ec-bg-tertiary" />

      {/* Password Section */}
      <div>
        <h3 className="mb-3 text-sm font-bold uppercase text-ec-text-secondary">Password</h3>
        <form onSubmit={handlePasswordChange} className="space-y-3">
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            placeholder="Current password"
            required
            className="w-full rounded bg-ec-input-bg p-2.5 text-ec-text-primary outline-none focus:ring-2 focus:ring-accent"
          />
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="New password"
            required
            minLength={8}
            className="w-full rounded bg-ec-input-bg p-2.5 text-ec-text-primary outline-none focus:ring-2 focus:ring-accent"
          />
          {passwordError && <p className="text-sm text-red-400">{passwordError}</p>}
          {passwordSuccess && <p className="text-sm text-green-400">Password changed!</p>}
          <button
            type="submit"
            disabled={passwordSaving}
            className="rounded bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-dark disabled:opacity-50"
          >
            {passwordSaving ? 'Changing...' : 'Change Password'}
          </button>
        </form>
      </div>

      <div className="h-px bg-ec-bg-tertiary" />

      {/* Two-Factor Authentication Section */}
      <div>
        <h3 className="mb-3 text-sm font-bold uppercase text-ec-text-secondary">
          Two-Factor Authentication
        </h3>

        {twoFaError && <p className="mb-3 text-sm text-red-400">{twoFaError}</p>}

        {!twoFactorEnabled && setupStep === 'idle' && (
          <div>
            <p className="mb-3 text-sm text-ec-text-secondary">
              Add an extra layer of security to your account with a TOTP authenticator app.
            </p>
            <button
              onClick={handleSetup2FA}
              disabled={twoFaLoading}
              className="rounded bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-dark disabled:opacity-50"
            >
              {twoFaLoading ? 'Setting up...' : 'Enable Two-Factor Auth'}
            </button>
          </div>
        )}

        {setupStep === 'qr' && (
          <div className="space-y-4">
            <p className="text-sm text-ec-text-secondary">
              Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.):
            </p>
            <div className="flex justify-center">
              <img src={qrCodeUrl} alt="TOTP QR Code" className="h-48 w-48 rounded bg-white p-2" />
            </div>
            <details className="text-sm">
              <summary className="cursor-pointer text-ec-text-link hover:underline">
                Can't scan? Enter manually
              </summary>
              <code className="mt-2 block break-all rounded bg-ec-bg-tertiary p-2 text-xs text-ec-text-primary">
                {manualSecret}
              </code>
            </details>
            <div>
              <label className="mb-2 block text-xs font-bold uppercase text-ec-text-secondary">
                Enter the 6-digit code
              </label>
              <div className="flex gap-3">
                <input
                  type="text"
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value)}
                  maxLength={6}
                  placeholder="000000"
                  className="w-40 rounded bg-ec-input-bg p-2.5 text-center text-lg tracking-widest text-ec-text-primary outline-none focus:ring-2 focus:ring-accent"
                />
                <button
                  onClick={handleEnable2FA}
                  disabled={twoFaLoading || totpCode.length !== 6}
                  className="rounded bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-dark disabled:opacity-50"
                >
                  {twoFaLoading ? 'Verifying...' : 'Verify & Enable'}
                </button>
              </div>
            </div>
            <button
              onClick={() => { setSetupStep('idle'); setTotpCode(''); setTwoFaError(''); }}
              className="text-sm text-ec-text-muted hover:text-ec-text-primary"
            >
              Cancel
            </button>
          </div>
        )}

        {setupStep === 'recovery' && (
          <div className="space-y-4">
            <p className="text-sm text-ec-text-secondary">
              Two-factor authentication is now enabled! Save these recovery codes somewhere safe.
              Each code can only be used once.
            </p>
            <div className="rounded bg-ec-bg-tertiary p-4">
              <div className="grid grid-cols-2 gap-2">
                {recoveryCodes.map((code) => (
                  <code key={code} className="text-sm text-ec-text-primary">{code}</code>
                ))}
              </div>
            </div>
            <button
              onClick={() => {
                navigator.clipboard.writeText(recoveryCodes.join('\n'));
              }}
              className="rounded bg-ec-bg-tertiary px-4 py-2 text-sm font-medium text-ec-text-primary hover:bg-ec-bg-modifier-hover"
            >
              Copy Codes
            </button>
            <button
              onClick={() => setSetupStep('idle')}
              className="ml-3 rounded bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-dark"
            >
              Done
            </button>
          </div>
        )}

        {twoFactorEnabled && setupStep === 'idle' && (
          <div className="space-y-4">
            <p className="text-sm text-green-400">Two-factor authentication is enabled.</p>
            <div className="rounded bg-ec-bg-secondary p-4">
              <p className="mb-3 text-sm text-ec-text-secondary">
                To disable, enter your TOTP code and password:
              </p>
              <div className="space-y-3">
                <input
                  type="text"
                  value={disableCode}
                  onChange={(e) => setDisableCode(e.target.value)}
                  maxLength={6}
                  placeholder="TOTP code"
                  className="w-full rounded bg-ec-input-bg p-2.5 text-ec-text-primary outline-none focus:ring-2 focus:ring-accent"
                />
                <input
                  type="password"
                  value={disablePassword}
                  onChange={(e) => setDisablePassword(e.target.value)}
                  placeholder="Password"
                  className="w-full rounded bg-ec-input-bg p-2.5 text-ec-text-primary outline-none focus:ring-2 focus:ring-accent"
                />
                <button
                  onClick={handleDisable2FA}
                  disabled={twoFaLoading || !disableCode || !disablePassword}
                  className="rounded bg-red-500 px-4 py-2 text-sm font-medium text-white hover:bg-red-600 disabled:opacity-50"
                >
                  {twoFaLoading ? 'Disabling...' : 'Disable Two-Factor Auth'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Voice & Audio Tab ── */
function VoiceAudioTab() {
  const { inputDeviceId, outputDeviceId, inputGain, outputVolume, noiseSuppression, setInputDevice, setOutputDevice, setInputGain, setOutputVolume, setNoiseSuppression } = useAudioSettingsStore();

  const [inputDevices, setInputDevices] = useState<MediaDeviceInfo[]>([]);
  const [outputDevices, setOutputDevices] = useState<MediaDeviceInfo[]>([]);

  // Mic test state
  const [micTesting, setMicTesting] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [loopbackPlaying, setLoopbackPlaying] = useState(false);
  const testStreamRef = useRef<MediaStream | null>(null);
  const testContextRef = useRef<AudioContext | null>(null);
  const testAnalyserRef = useRef<AnalyserNode | null>(null);
  const testIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const loopbackAudioRef = useRef<HTMLAudioElement | null>(null);

  const enumerateDevices = useCallback(async () => {
    try {
      // Request permission first so device labels are available
      const tempStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      tempStream.getTracks().forEach((t) => t.stop());

      const devices = await navigator.mediaDevices.enumerateDevices();
      setInputDevices(devices.filter((d) => d.kind === 'audioinput'));
      setOutputDevices(devices.filter((d) => d.kind === 'audiooutput'));
    } catch {
      // Permission denied or no devices
    }
  }, []);

  useEffect(() => {
    enumerateDevices();
  }, [enumerateDevices]);

  // Clean up mic test on unmount
  useEffect(() => {
    return () => {
      stopMicTest();
    };
  }, []);

  const startMicTest = async () => {
    try {
      const stream = await voiceService.getTestMicStream(inputDeviceId);
      testStreamRef.current = stream;

      const ctx = new AudioContext();
      testContextRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      testAnalyserRef.current = analyser;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      testIntervalRef.current = setInterval(() => {
        if (!testAnalyserRef.current) return;
        testAnalyserRef.current.getByteFrequencyData(dataArray);
        const avg = dataArray.reduce((a, b) => a + b) / dataArray.length;
        // Normalize to 0–1 range (average rarely exceeds ~80)
        setMicLevel(Math.min(1, avg / 80));
      }, 50);

      setMicTesting(true);
    } catch {
      // Failed to get mic
    }
  };

  const stopMicTest = () => {
    if (testIntervalRef.current) {
      clearInterval(testIntervalRef.current);
      testIntervalRef.current = null;
    }
    testAnalyserRef.current = null;
    testContextRef.current?.close();
    testContextRef.current = null;
    testStreamRef.current?.getTracks().forEach((t) => t.stop());
    testStreamRef.current = null;

    if (loopbackAudioRef.current) {
      loopbackAudioRef.current.pause();
      loopbackAudioRef.current.srcObject = null;
      loopbackAudioRef.current = null;
    }

    setMicTesting(false);
    setLoopbackPlaying(false);
    setMicLevel(0);
  };

  const toggleLoopback = () => {
    if (loopbackPlaying) {
      // Stop loopback
      if (loopbackAudioRef.current) {
        loopbackAudioRef.current.pause();
        loopbackAudioRef.current.srcObject = null;
        loopbackAudioRef.current = null;
      }
      setLoopbackPlaying(false);
    } else {
      // Start loopback — play mic stream through speakers
      if (testStreamRef.current) {
        const audio = new Audio();
        audio.srcObject = testStreamRef.current;

        const { outputDeviceId: outId } = useAudioSettingsStore.getState();
        if (outId && typeof (audio as any).setSinkId === 'function') {
          (audio as any).setSinkId(outId).catch(console.error);
        }
        audio.volume = outputVolume;
        audio.play().catch(console.error);
        loopbackAudioRef.current = audio;
        setLoopbackPlaying(true);
      }
    }
  };

  const handleInputChange = async (deviceId: string) => {
    const id = deviceId || null;
    setInputDevice(id);
    // If currently in voice, switch live
    if (voiceService.isConnected()) {
      try {
        await voiceService.switchInputDevice(id);
      } catch {
        // switch failed
      }
    }
    // If mic test is running, restart it with the new device
    if (micTesting) {
      stopMicTest();
      // Small delay to let old stream release
      setTimeout(() => startMicTest(), 100);
    }
  };

  const handleOutputChange = (deviceId: string) => {
    const id = deviceId || null;
    setOutputDevice(id);
    voiceService.setOutputDevice(id);
  };

  const handleInputGainChange = (value: number) => {
    setInputGain(value);
    voiceService.setInputGain(value);
  };

  const handleVolumeChange = (value: number) => {
    setOutputVolume(value);
    voiceService.setOutputVolume(value);
  };

  const handleNoiseSuppressionChange = async (enabled: boolean) => {
    setNoiseSuppression(enabled);
    if (voiceService.isConnected()) {
      try {
        await voiceService.setNoiseSuppression(enabled);
      } catch {
        // toggle failed
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* Input Device */}
      <div>
        <label className="mb-2 block text-xs font-bold uppercase text-ec-text-secondary">
          Input Device
        </label>
        <select
          value={inputDeviceId || ''}
          onChange={(e) => handleInputChange(e.target.value)}
          className="w-full rounded bg-ec-input-bg p-2.5 text-ec-text-primary outline-none focus:ring-2 focus:ring-accent"
        >
          <option value="">System Default</option>
          {inputDevices.map((d) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label || `Microphone (${d.deviceId.slice(0, 8)}...)`}
            </option>
          ))}
        </select>
      </div>

      {/* Input Volume / Gain */}
      <div>
        <label className="mb-2 block text-xs font-bold uppercase text-ec-text-secondary">
          Input Volume — {Math.round(inputGain * 100)}%
        </label>
        <input
          type="range"
          min={0}
          max={3}
          step={0.01}
          value={inputGain}
          onChange={(e) => handleInputGainChange(parseFloat(e.target.value))}
          className="w-full accent-accent"
        />
        <div className="mt-1 flex justify-between text-[10px] text-ec-text-muted">
          <span>0%</span>
          <span>100%</span>
          <span>200%</span>
          <span>300%</span>
        </div>
      </div>

      {/* Noise Suppression */}
      <div>
        <div className="flex items-center justify-between">
          <div>
            <label className="block text-xs font-bold uppercase text-ec-text-secondary">
              Noise Suppression
            </label>
            <p className="mt-0.5 text-xs text-ec-text-muted">
              Uses AI to filter background noise from your microphone
            </p>
          </div>
          <button
            onClick={() => handleNoiseSuppressionChange(!noiseSuppression)}
            className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
              noiseSuppression ? 'bg-accent' : 'bg-ec-bg-tertiary'
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                noiseSuppression ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Mic Test */}
      <div>
        <label className="mb-2 block text-xs font-bold uppercase text-ec-text-secondary">
          Mic Test
        </label>
        <div className="rounded-md bg-ec-bg-secondary p-4">
          {/* Volume bar */}
          <div className="mb-3 h-2 overflow-hidden rounded-full bg-ec-bg-tertiary">
            <div
              className="h-full rounded-full bg-green-500 transition-all duration-75"
              style={{ width: `${micLevel * 100}%` }}
            />
          </div>

          <div className="flex gap-2">
            <button
              onClick={micTesting ? stopMicTest : startMicTest}
              className={`rounded px-4 py-1.5 text-sm font-medium ${
                micTesting
                  ? 'bg-red-500 text-white hover:bg-red-600'
                  : 'bg-accent text-white hover:bg-accent-dark'
              }`}
            >
              {micTesting ? 'Stop Test' : "Let's Check"}
            </button>

            {micTesting && (
              <button
                onClick={toggleLoopback}
                className={`rounded px-4 py-1.5 text-sm font-medium ${
                  loopbackPlaying
                    ? 'bg-ec-bg-tertiary text-ec-text-primary hover:bg-ec-bg-modifier-hover'
                    : 'bg-ec-bg-tertiary text-ec-text-secondary hover:bg-ec-bg-modifier-hover hover:text-ec-text-primary'
                }`}
              >
                {loopbackPlaying ? 'Stop Loopback' : 'Play Loopback'}
              </button>
            )}
          </div>

          {micTesting && (
            <p className="mt-2 text-xs text-ec-text-muted">
              Speak into your microphone — the bar above should move.
              {loopbackPlaying && ' You should hear yourself.'}
            </p>
          )}
        </div>
      </div>

      {/* Output Device */}
      <div>
        <label className="mb-2 block text-xs font-bold uppercase text-ec-text-secondary">
          Output Device
        </label>
        <select
          value={outputDeviceId || ''}
          onChange={(e) => handleOutputChange(e.target.value)}
          className="w-full rounded bg-ec-input-bg p-2.5 text-ec-text-primary outline-none focus:ring-2 focus:ring-accent"
        >
          <option value="">System Default</option>
          {outputDevices.map((d) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label || `Speaker (${d.deviceId.slice(0, 8)}...)`}
            </option>
          ))}
        </select>
      </div>

      {/* Output Volume */}
      <div>
        <label className="mb-2 block text-xs font-bold uppercase text-ec-text-secondary">
          Output Volume — {Math.round(outputVolume * 100)}%
        </label>
        <input
          type="range"
          min={0}
          max={2}
          step={0.01}
          value={outputVolume}
          onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
          className="w-full accent-accent"
        />
        <div className="mt-1 flex justify-between text-[10px] text-ec-text-muted">
          <span>0%</span>
          <span>100%</span>
          <span>200%</span>
        </div>
      </div>
    </div>
  );
}

/* ── Video Tab ── */
function VideoTab() {
  const { videoDeviceId, setVideoDevice } = useAudioSettingsStore();
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const previewRef = useRef<HTMLVideoElement>(null);
  const previewStreamRef = useRef<MediaStream | null>(null);

  const enumerateVideoDevices = useCallback(async () => {
    try {
      // Request permission so device labels are available
      const tempStream = await navigator.mediaDevices.getUserMedia({ video: true });
      tempStream.getTracks().forEach((t) => t.stop());

      const devices = await navigator.mediaDevices.enumerateDevices();
      setVideoDevices(devices.filter((d) => d.kind === 'videoinput'));
    } catch {
      // Permission denied or no devices
    }
  }, []);

  useEffect(() => {
    enumerateVideoDevices();
  }, [enumerateVideoDevices]);

  // Stable device ID to use for preview (avoids re-running effect on every render)
  const activeDeviceId = useMemo(() => videoDeviceId, [videoDeviceId]);

  // Start/restart camera preview when device changes
  useEffect(() => {
    let cancelled = false;

    const startPreview = async () => {
      // Stop previous preview
      if (previewStreamRef.current) {
        previewStreamRef.current.getTracks().forEach((t) => t.stop());
        previewStreamRef.current = null;
      }

      try {
        const constraints: MediaTrackConstraints = {};
        if (activeDeviceId) {
          constraints.deviceId = { exact: activeDeviceId };
        }
        const stream = await navigator.mediaDevices.getUserMedia({ video: constraints });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        previewStreamRef.current = stream;
        if (previewRef.current) {
          previewRef.current.srcObject = stream;
        }
      } catch {
        // Camera access failed
      }
    };

    startPreview();

    return () => {
      cancelled = true;
      if (previewStreamRef.current) {
        previewStreamRef.current.getTracks().forEach((t) => t.stop());
        previewStreamRef.current = null;
      }
      if (previewRef.current) {
        previewRef.current.srcObject = null;
      }
    };
  }, [activeDeviceId]);

  const handleDeviceChange = async (deviceId: string) => {
    const id = deviceId || null;
    setVideoDevice(id);
    // If currently in a voice call with video active, switch live
    if (voiceService.isConnected()) {
      try {
        await voiceService.switchVideoDevice(id);
      } catch {
        // switch failed
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* Camera Device */}
      <div>
        <label className="mb-2 block text-xs font-bold uppercase text-ec-text-secondary">
          Camera
        </label>
        <select
          value={videoDeviceId || ''}
          onChange={(e) => handleDeviceChange(e.target.value)}
          className="w-full rounded bg-ec-input-bg p-2.5 text-ec-text-primary outline-none focus:ring-2 focus:ring-accent"
        >
          <option value="">System Default</option>
          {videoDevices.map((d) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label || `Camera (${d.deviceId.slice(0, 8)}...)`}
            </option>
          ))}
        </select>
      </div>

      {/* Camera Preview */}
      <div>
        <label className="mb-2 block text-xs font-bold uppercase text-ec-text-secondary">
          Preview
        </label>
        <div className="overflow-hidden rounded-md bg-ec-bg-secondary">
          <video
            ref={previewRef}
            autoPlay
            playsInline
            muted
            className="h-[280px] w-full object-cover"
          />
        </div>
      </div>
    </div>
  );
}
