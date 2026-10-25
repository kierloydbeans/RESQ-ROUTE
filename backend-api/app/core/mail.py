import json
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from app.core.config import settings


def send_email(email_to: str, subject: str, body: str, html_body: str | None = None) -> None:
    payload = {
        "sender": {
            "name": settings.EMAILS_FROM_NAME,
            "email": settings.EMAILS_FROM_EMAIL,
        },
        "to": [{"email": email_to}],
        "subject": subject,
        "textContent": body,
    }
    if html_body:
        payload["htmlContent"] = html_body

    request = Request(
        settings.BREVO_API_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "accept": "application/json",
            "api-key": settings.BREVO_API_KEY,
            "content-type": "application/json",
        },
        method="POST",
    )

    try:
        with urlopen(request, timeout=15) as response:
            if response.status < 200 or response.status >= 300:
                raise RuntimeError(f"Brevo email request failed with status {response.status}")
    except HTTPError as error:
        response_body = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Brevo email request failed with status {error.code}: {response_body}") from error
    except URLError as error:
        raise RuntimeError(f"Brevo email request could not be sent: {error.reason}") from error

def send_reset_password_email(email_to: str, token: str) -> None:
    # Set to your React Dashboard URL or local dev host
    reset_link = f"https://resq-route-frontend.onrender.com/reset-password?token={token}"
    
    subject = "ResQ-Route: Password Reset Request"
    body = f"""Hello,

You requested a password reset for your ResQ-Route account.

Click or paste the link below in your browser to set a new password. This link expires in 30 minutes:
{reset_link}

If you did not make this request, please disregard this email.

Stay safe,
The ResQ-Route Team
"""
    send_email(email_to=email_to, subject=subject, body=body)

def send_otp_email(email_to: str, otp_code: str) -> None:
    subject = f"{settings.PROJECT_NAME} - Your Verification Code"
    
    # Text fallback for strict mail clients
    text_content = f"""Hello,

Your verification code for registering your ResQ-Route account is: {otp_code}

This code is valid for 10 minutes. Do not share this code with anyone.

Stay safe,
The ResQ-Route Team
"""

    # Clean HTML layout
    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <style>
            body {{ font-family: Arial, sans-serif; background-color: #f4f6f8; margin: 0; padding: 20px; }}
            .container {{ max-width: 500px; background: #ffffff; padding: 30px; border-radius: 8px; margin: 0 auto; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }}
            .header {{ font-size: 20px; font-weight: bold; color: #1e293b; margin-bottom: 20px; }}
            .code-box {{ background-color: #f1f5f9; border: 1px dashed #cbd5e1; font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #2563eb; text-align: center; padding: 15px; margin: 20px 0; border-radius: 6px; }}
            .footer {{ font-size: 12px; color: #64748b; margin-top: 25px; text-align: center; }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">Verify Your Email</div>
            <p>Use the 6-digit code below to complete your registration for <strong>{settings.PROJECT_NAME}</strong>:</p>
            <div class="code-box">{otp_code}</div>
            <p>This code will expire in <strong>10 minutes</strong>. If you did not request this code, you can safely ignore this email.</p>
            <div class="footer">
                &copy; ResQ-Route System. All rights reserved.
            </div>
        </div>
    </body>
    </html>
    """

    send_email(
        email_to=email_to,
        subject=subject,
        body=text_content,
        html_body=html_content,
    )