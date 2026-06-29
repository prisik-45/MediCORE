# admin.md

# MediCORE - Admin Portal Implementation Guide

## Objective

Create a dedicated **Admin Portal** for MediCORE using the **same UI theme, layout, sidebar style, typography, colors, spacing, cards, tables, and animations** already used throughout the existing application. The Admin Portal should feel like a natural extension of the current product.

---

# Sidebar Navigation

The Admin Portal should contain **only three sidebar items**.

```
Dashboard
Employee Management
Database Overview
```

---

# 1. Dashboard

Display three statistic cards at the top.

### Cards

* Total Employees
* Total Supplier Emails Processed
* AI Queries Today

Use the same animated metric cards already used in the employee dashboard.

---

# 2. Employee Management

This page allows administrators to manage employee access.

## Top Action

A prominent **"Add Employee"** button.

When clicked, open a modal containing:

```
Employee Name
Employee Email
Send Invitation
Cancel
```

The email field must validate proper email format before submission.

---

## Employee Table

Create a modern responsive table.

| Employee Name | Connected Email | Status | Last Sync | Actions |
| ------------- | --------------- | ------ | --------- | ------- |

Actions:

* Reset Password
* Remove Employee

Status examples:

* Active
* Pending Activation
* Disabled

Connected Email should display the employee's Gmail address used for supplier email synchronization.

Last Sync should display relative time such as:

```
5 minutes ago

2 hours ago

Yesterday
```

---

# Reset Password

When clicked:

Generate a secure password reset token.

Email the employee a password reset link.

The link should expire after **2 hours**.

---

# Remove Employee

Show confirmation dialog.

```
Are you sure you want to remove this employee?

Cancel
Remove
```

Removing an employee should:

* Disable login
* Stop email synchronization
* Preserve procurement history in the database

Do not permanently delete procurement records.

---

# 3. Database Overview

Display statistics using dashboard cards.

Cards:

* Total Suppliers
* Total Ingredients
* Database Size
* AI Searches / Day
* AI Queries / Month

These values should come from backend APIs.

---

# Employee Login & Invitation Flow

The system should implement the following workflow.

---

## Step 1 — Admin Creates Employee

The administrator enters:

* Employee Name
* Employee Email

Then presses:

```
Send Invitation
```

Create the employee record with:

```
status = Pending Activation
```

No password is created yet.

Generate:

* Secure random activation token
* Expiration time = 2 hours

Store both securely in the database.

---

## Step 2 — Send Invitation Email

Immediately after employee creation, send an email.

Subject:

```
You're invited to join MediCORE
```

Email example:

```
Hi John,

You've been invited to use MediCORE.

Click the button below to activate your account.

Activate Account

This activation link expires in 2 hours.

If you did not expect this invitation, you can safely ignore this email.

Regards,
MediCORE Team
```

The activation button should open

```
https://your-domain.com/activate?token=xxxxxxxx
```

The token must be single-use.

---

# How to Send Invitation Email (Free)

Use **Gmail SMTP**.

Backend:

FastAPI

Library:

```
FastAPI-Mail
```

or

```
smtplib
```

Configuration:

```
SMTP Server:
smtp.gmail.com

Port:
587 (TLS)

Sender Email:
medicore.ai@gmail.com

Authentication:
Gmail App Password
```

Store credentials inside `.env`.

Example:

```
SMTP_EMAIL=medicore.ai@gmail.com
SMTP_PASSWORD=your_app_password
```

Flow:

```
Admin clicks Send Invitation

↓

FastAPI generates activation token

↓

Save token in PostgreSQL

↓

Send invitation email using Gmail SMTP

↓

Employee receives invitation

↓

Employee activates account
```

This solution is completely free and suitable for the current MediCORE MVP.

---

# Step 3 — Employee Activation

When the employee clicks the activation link:

Validate:

* Token exists
* Token has not expired
* Token has not already been used

If valid:

Redirect to the existing **Registration Page** (already implemented).

The employee completes:

```
Create Password

Confirm Password

Activate Account
```

Hash the password using bcrypt.

Update:

```
status = Active
```

Delete or invalidate the activation token after successful activation.

---

# Step 4 — First Login

Employee logs into MediCORE using:

```
Employee Email

Password
```

---

# Step 5 — Connect Gmail

Immediately after first login, if Gmail is not connected, redirect the employee to the Gmail setup page.

Display:

```
Connect Your Gmail Account

Gmail Address

Gmail App Password
```

Show the following explanation:

---

## Why is an App Password Required?

MediCORE reads supplier emails automatically.

For security reasons, Gmail requires an **App Password** instead of your normal Gmail password.

Your normal Gmail password is never stored inside MediCORE.

---

## How to Generate a Gmail App Password

1. Enable 2-Step Verification on your Google account.
2. Open your Google Account settings.
3. Go to **Security**.
4. Open **App Passwords**.
5. Create a new App Password.
6. Choose:

   * App: Mail
   * Device: Other → MediCORE
7. Copy the generated 16-character password.
8. Paste it into MediCORE.
9. Click **Save**.

---

The backend should:

* Encrypt the App Password before storing it.
* Never store it as plain text.
* Use the encrypted App Password for automatic supplier email synchronization.

---

# Security Requirements

* Passwords must be hashed using same technique used previously.
* Activation links expire after 2 hours.
* Activation tokens are single-use.
* App Passwords must be encrypted before database storage.
* Employees can only access their own procurement data.
* Only Admin users can access the Admin Portal.
* Non-admin users must be redirected away from admin routes.

---

# UI Requirements

The Admin Portal must reuse the existing MediCORE design system.

Use the same:

* Sidebar
* Navbar
* Cards
* Buttons
* Tables
* Icons
* Animations
* Fonts
* Colors
* Spacing
* Border radius
* Dark/Light theme behavior

No new design language should be introduced. The Admin pages should look identical to the rest of the application.
