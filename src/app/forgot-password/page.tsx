"use client";

// [ONB-1 / round-2 Wave A] Password-reset request step. The roadmap's
// onboarding extension says "verified password-reset E2E once SP5 lands";
// SP5 (env-driven mail transport, RUNBOOK §email) has shipped, so this page
// plus /reset-password close the loop: a learner who cannot log in has a
// self-service recovery path instead of a dead end on /login.
//
// The API is dj-rest-auth's mounted-at-default include (backend
// webcoder_api/urls.py `api/v1/auth/`): POST /auth/password/reset/ {email}.
// The success copy is deliberately account-agnostic (no enumeration leak):
// the backend answers 200 for unknown emails too.

import React, { useState, FormEvent } from "react";
import NextLink from "next/link";
import { useTranslation } from "react-i18next";
import { AuthService } from "@/services/ApiService";
import {
  Container,
  Box,
  TextField,
  Button,
  Typography,
  Link,
  Alert,
  CircularProgress,
} from "@mui/material";

const ForgotPasswordPage: React.FC = () => {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await AuthService.requestPasswordReset(email);
      setSent(true);
    } catch (err: unknown) {
      setError(
        err instanceof Error && err.message
          ? err.message
          : t("forgot_password_error", "Could not send the reset link. Please try again."),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Container maxWidth="xs">
      <Box
        sx={{
          marginTop: 8,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        <Typography component="h1" variant="h5">
          {t("forgot_password_title", "Reset your password")}
        </Typography>
        {error && (
          <Alert severity="error" sx={{ width: "100%", mt: 2 }} data-testid="forgot-password-error">
            {error}
          </Alert>
        )}
        {sent ? (
          <Alert
            severity="success"
            sx={{ width: "100%", mt: 3 }}
            data-testid="forgot-password-sent"
          >
            {t(
              "forgot_password_sent",
              "If that email belongs to an account, a reset link is on its way. Check your inbox (and spam folder).",
            )}
          </Alert>
        ) : (
          <Box component="form" onSubmit={handleSubmit} noValidate sx={{ mt: 1, width: "100%" }}>
            <Typography variant="body2" sx={{ mb: 1 }}>
              {t(
                "forgot_password_intro",
                "Enter your account email and we'll send you a reset link.",
              )}
            </Typography>
            <TextField
              margin="normal"
              required
              fullWidth
              id="forgot-password-email"
              label={t("forgot_password_email_label", "Email address")}
              name="email"
              type="email"
              autoComplete="email"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Button
              type="submit"
              fullWidth
              variant="contained"
              sx={{ mt: 3, mb: 2 }}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <CircularProgress size={24} />
              ) : (
                t("forgot_password_button", "Send reset link")
              )}
            </Button>
          </Box>
        )}
        <Typography variant="body2" align="center" sx={{ mt: 2 }}>
          <Link component={NextLink} href="/login" variant="body2">
            {t("forgot_password_back", "Back to login")}
          </Link>
        </Typography>
      </Box>
    </Container>
  );
};

export default ForgotPasswordPage;
