# SSH and Deployment User Setup Guide

This guide describes how to create a dedicated user for deployment, generate SSH keys, and configure access.

## 1. Connect to your Server
Connect to your Yandex Cloud VM as `root` (or a user with `sudo` privileges).

```bash
ssh root@<YOUR_VM_IP>
```

## 2. Create a Deployment User
It is best practice to use a dedicated user for deployment (e.g., `deploy`) instead of root.

```bash
# Create user 'deploy'
adduser deploy

# Add 'deploy' to the 'docker' group (so it can run docker commands without sudo)
usermod -aG docker deploy

# Switch to the new user to verify
su - deploy

# Create .ssh directory
mkdir -p ~/.ssh
chmod 700 ~/.ssh

# Create an empty authorized_keys file
touch ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
```

## 3. Generate SSH Keys (On Local Machine)
Open **PowerShell** on your local Windows machine.

```powershell
# Generate a new ED25519 key pair
# -t ed25519: The key type (modern and secure)
# -C "deploy@quokkaq": A comment to identify the key
# -f "$HOME\.ssh\quokka_deploy": The file path to save the key
ssh-keygen -t ed25519 -C "deploy@quokkaq" -f "$HOME\.ssh\quokka_deploy"
```

> [!IMPORTANT]
> When asked for a passphrase, **press Enter twice** to leave it empty. GitHub Actions cannot enter a passphrase interactively.

## 4. Copy Public Key to Server
1.  **Read the Public Key** on your local machine:
    ```powershell
    Get-Content "$HOME\.ssh\quokka_deploy.pub"
    ```
    *Copy the output (it starts with `ssh-ed25519 ...`).*

2.  **Paste into Server**:
    Back on your server (as user `deploy`):
    ```bash
    # Open the authorized_keys file
    nano ~/.ssh/authorized_keys
    ```
    *   Paste the public key (Right-click in most terminals).
    *   Press `Ctrl+O`, `Enter` to save.
    *   Press `Ctrl+X` to exit.

## 5. Verify Permissions (Critical)
Ensure the file permissions are correct on the server:

```bash
# Ensure ownership is correct
chown -R deploy:deploy /home/deploy/.ssh

# Ensure permissions are restrictive
chmod 700 /home/deploy/.ssh
chmod 600 /home/deploy/.ssh/authorized_keys
```

## 6. Test Connection (Local Machine)
Try to connect from your local PowerShell using the **Private Key**:

```powershell
ssh -i "$HOME\.ssh\quokka_deploy" deploy@<YOUR_VM_IP>
```

If this works, you are ready to update GitHub.

## 7. Update GitHub Secrets
Go to your GitHub Repository -> **Settings** -> **Secrets and variables** -> **Actions**.

1.  **VM_USERNAME**: Set to `deploy`.
2.  **VM_SSH_KEY**:
    *   Read the **Private Key** locally:
        ```powershell
        Get-Content "$HOME\.ssh\quokka_deploy"
        ```
    *   Copy the **entire** content (including `-----BEGIN...` and `-----END...`).
    *   Paste it into the secret value.
