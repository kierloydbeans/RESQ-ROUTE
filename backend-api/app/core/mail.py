# app/core/mail.py
import smtplib
from email.message import EmailMessage
from app.core.config import settings

def send_email(email_to: str, subject: str, body: str) -> None:
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = f"{settings.EMAILS_FROM_NAME} <{settings.EMAILS_FROM_EMAIL}>"
    msg["To"] = email_to
    msg.set_content(body)

    with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as server:
        if settings.SMTP_TLS:
            server.starttls()
        server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
        server.send_message(msg)

def send_reset_password_email(email_to: str, token: str) -> None:
    # Set to your React Dashboard URL or local dev host
    reset_link = f"http://localhost:3000/reset-password?token={token}"
    
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
    """
    Sends a 6-digit verification OTP code via SMTP.
    """
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

    msg = EmailMessage()
    msg['Subject'] = subject
    msg['From'] = f"{settings.EMAILS_FROM_NAME} <{settings.EMAILS_FROM_EMAIL}>"
    msg['To'] = email_to
    
    msg.set_content(text_content)
    msg.add_alternative(html_content, subtype='html')

    # Send using your SMTP settings
    with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as server:
        if settings.SMTP_TLS:
            server.starttls()
        if settings.SMTP_USER and settings.SMTP_PASSWORD:
            server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
        server.send_message(msg)