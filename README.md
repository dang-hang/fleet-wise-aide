# Fleet Wise Aide

An AI-powered automotive manual assistant that helps mechanics and fleet managers find information quickly using RAG (Retrieval-Augmented Generation).

## Architecture

The project consists of two main components:

1.  **Frontend**: A React application (Vite) hosted on Supabase/Netlify.
2.  **Backend**: A Python Flask API handling RAG operations, PDF processing, and manual management.

### Backend (V2)

The backend is located in the `v2/` directory and provides the following features:
-   **RAG System**: Uses OpenAI and PyMuPDF to index and retrieve manual sections.
-   **Multi-tenancy**: Securely isolates manuals per user using Supabase Auth.
-   **Streaming Chat**: Provides real-time AI responses with citations.
-   **PDF Processing**: Automatically extracts text, hierarchy, and images from uploaded manuals.

## Setup

### Prerequisites
-   Node.js & npm
-   Python 3.10+
-   Supabase project
-   OpenAI API Key

### Frontend Setup
```sh
npm install
npm run dev
```

### Backend Setup
```sh
cd v2
pip install -r requirements.txt
python3 -m flask run --port 5000
```

### Environment Variables
Create a `.env` file in `v2/` with:
```dotenv
OPENAI_API_KEY=sk-...
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-service-role-key
STORAGE_PATH=manuals
FLASK_ENV=production
```

## Deployment

-   **Frontend**: Deploy to Netlify, Vercel, or Supabase Hosting.
-   **Backend**: Deploy `v2/` to Railway, Fly.io, or any container platform using the provided `Dockerfile`.

## License
MIT
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## How can I deploy this project?

Simply open [Lovable](https://lovable.dev/projects/0ede7204-5bee-4454-8c73-668d07763394) and click on Share -> Publish.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/features/custom-domain#custom-domain)
