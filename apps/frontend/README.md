# <img src="./public/quokka-logo.svg" width="64" height="64" alt="QuokkaQ Logo" style="vertical-align: middle; margin-right: 10px;"> QuokkaQ Frontend

<img src="./public/logo-text.svg" alt="QuokkaQ Text Logo" width="200">

QuokkaQ is a modern queue management system frontend built with Next.js. It provides a user-friendly interface for managing tickets, queues, and service units.

## 🛠 Tech Stack

- **Framework**: [Next.js 16](https://nextjs.org/) (App Router)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/)
- **UI Components**: [shadcn/ui](https://ui.shadcn.com/)
- **Language**: [TypeScript](https://www.typescriptlang.org/)
- **Containerization**: [Docker](https://www.docker.com/)

## 🚀 Getting Started

### Prerequisites

- Node.js 20+
- npm / yarn / pnpm
- Docker (optional, for containerized run)

### Local Development

1.  **Install dependencies:**

    ```bash
    npm install
    # or
    yarn install
    ```

2.  **Run the development server:**

    ```bash
    npm run dev
    # or
    yarn dev
    ```

    Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

### Docker Development

To run locally with Docker Compose (connected to the backend):

```powershell
docker compose -f ..\docker-compose.dev.yml up --build -d
```

The frontend dev server will be available at `http://localhost:3000`.

### Environment Variables

Create a `.env.local` file in the root of the project for local development:

```bash
# API Configuration
NEXT_PUBLIC_API_URL=http://localhost:3001

# WebSocket Configuration
# For local development:
NEXT_PUBLIC_WS_URL=http://localhost:3001
# For production deployment, set to:
# NEXT_PUBLIC_WS_URL=wss://api.quokkaq.v-b.tech
```

> [!IMPORTANT]
> **For production deployment**, you MUST set `NEXT_PUBLIC_WS_URL` to the production WebSocket URL:
>
> - Add it to your CI/CD environment variables (GitHub Secrets/Variables)
> - Or set it in your Docker environment configuration
> - Or create a `.env.production` file (not recommended for sensitive data)

## 📦 Deployment

The project is configured for automated deployment to **Yandex Cloud** using GitHub Actions.

### Workflow

The deployment pipeline is triggered by pushing to the `prod-release` branch.

1.  **Trigger**: Push to `prod-release`.
2.  **Versioning**:
    - The workflow automatically bumps the **patch** version in `package.json` (e.g., `0.1.0` -> `0.1.1`).
    - Creates a new git tag `vX.Y.Z`.
    - Pushes the version bump and tag back to the repository.
3.  **Build & Push**:
    - Builds a Docker image using the `Dockerfile` (optimized with `output: 'standalone'`).
    - Pushes the image to Yandex Container Registry.
4.  **Deploy**:
    - Connects to the Yandex Cloud VM via SSH.
    - Pulls the new image.
    - Restarts the application container.

### Secrets Required

To enable deployment, the following secrets must be set in the GitHub Repository:

- `YC_REGISTRY_ID`: Yandex Container Registry ID.
- `YC_SA_JSON_CREDENTIALS`: JSON key for the Service Account.
- `VM_HOST`: Public IP of the VM.
- `VM_USERNAME`: SSH username.
- `VM_SSH_KEY`: SSH private key.

## 🔄 Versioning

Versioning is handled automatically by the deployment script.

- **Patch** versions are incremented on every deploy.
- **Minor/Major** versions should be updated manually in `package.json` before merging to `prod-release` if needed.
