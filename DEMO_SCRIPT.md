# Demo Script

1. **Setup** (10s)
   - `chrome://extensions` → Developer mode → Load unpacked → select folder.
   - Pin the extension, open Gmail.

2. **Local detection** (20s)
   - Open the sample phishing email (see below).
   - Point to the banner: **Dangerous**, risk score, then expand **Why?** to show the rule-by-rule breakdown.

3. **Demo mode** (15s)
   - Click the extension icon → **Demo**.
   - Show the popup rendering tier, score, and findings.

4. **Options** (15s)
   - Open Options → Appearance / Detection / API Keys / Advanced.
   - Show that API keys are optional and stored locally.
   - Click **Self-audit JSON export**.

5. **Trusted sender** (10s)
   - With a safe email open, click **Trust sender**, then reopen the email — banner shows **Trusted**.

## Sample phishing email

**Subject:** Important: Verify Your Account Immediately  
**From:** "PayPal Support" `<support@secure-notice.example>`  
**Body:**

> Dear user, we detected unusual activity on your account. Your account will be suspended in 24 hours unless you verify your information. Click the secure link below to confirm your password: http://paypa1-secure.verify-login.top/confirm

**Attachment:** `invoice.pdf.exe`