'use client';

// OPS-2 (Wave D): security settings — TOTP enrollment for privileged
// roles + the personal API token (the public-API companion credential).

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Box, Button, CircularProgress, TextField } from '@mui/material';
import { AuthService } from '@/services/ApiService';
import { useAuth } from '@/context/AuthContext';

const errorMessage = (err: unknown, fallback: string): string =>
  err instanceof Error && err.message ? err.message : fallback;

const cardStyle: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid rgba(255,255,255,0.06)',
  borderRadius: '12px',
  padding: '1.5rem',
  marginBottom: '1.5rem',
};

const headerStyle: React.CSSProperties = {
  fontSize: '0.72rem',
  fontWeight: 700,
  color: 'var(--muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  marginBottom: '1rem',
};

export function TwoFactorCard({ onEnabledChange }: { onEnabledChange?: (enabled: boolean) => void }) {
  const { t } = useTranslation();
  const { user, refreshUser } = useAuth();
  const enabled = user?.two_factor_enabled ?? false;
  const [pending, setPending] = useState<{ secret: string; otpauth_uri: string } | null>(null);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const begin = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      setPending(await AuthService.totpBegin());
    } catch (err) {
      setError(errorMessage(err, t('totp_begin_failed', 'Failed to start enrollment.')));
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    setBusy(true);
    setError(null);
    try {
      await AuthService.totpVerify(code);
      setPending(null);
      setCode('');
      setNotice(t('totp_enabled_notice', 'Two-factor authentication enabled.'));
      onEnabledChange?.(true);
      await refreshUser?.();
    } catch (err) {
      setError(errorMessage(err, t('totp_verify_failed', 'Invalid or expired code.')));
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    setError(null);
    try {
      await AuthService.totpDisable(code, password);
      setCode('');
      setPassword('');
      setNotice(t('totp_disabled_notice', 'Two-factor authentication disabled.'));
      onEnabledChange?.(false);
      await refreshUser?.();
    } catch (err) {
      setError(errorMessage(err, t('totp_disable_failed', 'Could not disable — check your code and password.')));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={cardStyle} aria-labelledby="totp-card-header">
      <div id="totp-card-header" style={headerStyle}>
        {t('two_factor_header', 'Two-Factor Authentication (TOTP)')}
      </div>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {notice && <Alert severity="success" sx={{ mb: 2 }}>{notice}</Alert>}

      {enabled ? (
        <Box component="form" noValidate aria-label={t('totp_disable_form_label', 'Disable two-factor')}>
          <Alert severity="info" sx={{ mb: 2 }}>
            {t('totp_enabled_status', 'Your account requires a TOTP code from your authenticator app.')}
          </Alert>
          <TextField
            margin="normal" required fullWidth size="small"
            label={t('totp_code_label', 'Authenticator code')}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            slotProps={{ htmlInput: { inputMode: 'numeric', pattern: '[0-9]*', maxLength: 6 } }}
          />
          <TextField
            margin="normal" required fullWidth size="small" type="password"
            label={t('current_password_label', 'Current Password')}
            value={password}
            onChange={(e) => setPassword(e.target.value)}

          />
          <Button variant="outlined" color="error" sx={{ mt: 2 }} disabled={busy || !code || !password} onClick={disable}>
            {busy ? <CircularProgress size={20} /> : t('totp_disable_button', 'Disable two-factor')}
          </Button>
        </Box>
      ) : pending ? (
        <Box aria-label={t('totp_enroll_form_label', 'Confirm enrollment')}>
          <p style={{ color: 'var(--muted)', fontSize: '0.85rem', marginTop: 0 }}>
            {t('totp_scan_hint', 'Add this secret to your authenticator app (Google Authenticator, Aegis, 1Password…), then enter the current 6-digit code.')}
          </p>
          <Box
            data-testid="totp-secret"
            sx={{
              fontFamily: 'var(--font-mono, monospace)',
              background: 'var(--surface-2)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              p: 1,
              mb: 1,
              wordBreak: 'break-all',
              fontSize: '0.9rem',
            }}
          >
            {pending.secret}
          </Box>
          <Box sx={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', mb: 2, wordBreak: 'break-all' }}>
            {pending.otpauth_uri}
          </Box>
          <TextField
            margin="normal" required fullWidth size="small"
            label={t('totp_code_label', 'Authenticator code')}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            slotProps={{ htmlInput: { inputMode: 'numeric', pattern: '[0-9]*', maxLength: 6 } }}
          />
          <Button variant="contained" sx={{ mt: 2 }} disabled={busy || code.length !== 6} onClick={verify}>
            {busy ? <CircularProgress size={20} /> : t('totp_verify_button', 'Verify and enable')}
          </Button>
        </Box>
      ) : (
        <Box>
          <p style={{ color: 'var(--muted)', fontSize: '0.85rem', marginTop: 0 }}>
            {t('totp_pitch', 'Protect your account with a time-based one-time code from an authenticator app. Recommended for creators, verifiers, teachers and admins.')}
          </p>
          <Button variant="contained" onClick={begin} disabled={busy}>
            {busy ? <CircularProgress size={20} /> : t('totp_begin_button', 'Enable two-factor')}
          </Button>
        </Box>
      )}
    </div>
  );
}

export function ApiTokenCard() {
  const { t } = useTranslation();
  const [tokens, setTokens] = useState<{ key_hint: string; created: string }[] | null>(null);
  const [freshKey, setFreshKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = React.useCallback(async () => {
    try {
      const data = await AuthService.getApiTokens();
      setTokens(data.results);
    } catch (err) {
      setError(errorMessage(err, t('token_load_failed', 'Failed to load tokens.')));
    }
  }, [t]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const mint = async () => {
    setBusy(true);
    setError(null);
    setFreshKey(null);
    try {
      const data = await AuthService.createApiToken();
      setFreshKey(data.key);
      await load();
    } catch (err) {
      setError(errorMessage(err, t('token_create_failed', 'Failed to create the token.')));
    } finally {
      setBusy(false);
    }
  };

  const revoke = async () => {
    setBusy(true);
    setError(null);
    setFreshKey(null);
    try {
      await AuthService.revokeApiToken();
      await load();
    } catch (err) {
      setError(errorMessage(err, t('token_revoke_failed', 'Failed to revoke the token.')));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={cardStyle} aria-labelledby="api-token-card-header">
      <div id="api-token-card-header" style={headerStyle}>
        {t('api_token_header', 'Personal API Token')}
      </div>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      <p style={{ color: 'var(--muted)', fontSize: '0.85rem', marginTop: 0 }}>
        {t('api_token_pitch', 'Use the public read API (240/min instead of 60/min) with "Authorization: Token <key>". The key is shown only once.')}
      </p>

      {freshKey && (
        <Alert severity="success" sx={{ mb: 2 }} data-testid="fresh-token">
          {t('api_token_fresh_notice', 'Store this key now — it will not be shown again:')}
          <Box sx={{ fontFamily: 'var(--font-mono, monospace)', mt: 0.5, wordBreak: 'break-all' }}>{freshKey}</Box>
        </Alert>
      )}

      {tokens && tokens.length > 0 ? (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
          <span data-testid="token-hint" style={{ fontFamily: 'var(--font-mono, monospace)', color: 'var(--foreground)' }}>
            {tokens[0].key_hint}
          </span>
          <Button variant="outlined" color="error" size="small" onClick={revoke} disabled={busy}>
            {busy ? <CircularProgress size={16} /> : t('api_token_revoke_button', 'Revoke')}
          </Button>
        </Box>
      ) : (
        <Button variant="contained" onClick={mint} disabled={busy}>
          {busy ? <CircularProgress size={20} /> : t('api_token_create_button', 'Create token')}
        </Button>
      )}
    </div>
  );
}

export default function SecurityPanel() {
  return (
    <div>
      <TwoFactorCard />
      <ApiTokenCard />
    </div>
  );
}
