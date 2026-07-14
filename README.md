# 🌿 DynoNutriAI — AI-Powered Nutrition Assistant

> **Premium SaaS-grade AI Nutrition Agent** — built with Python Flask · IBM watsonx.ai · Granite LLMs · Dark UI

![DynoNutriAI Banner](static/images/logo.png)

---

## ✨ Features

| Module | Description |
|---|---|
| 💬 **Chat Assistant** | Conversational AI using IBM Granite models — Indian food-aware, family-sensitive |
| 📊 **Nutrition Dashboard** | Water tracker, macro log, animated progress bars |
| 🔍 **Nutrition Analyzer** | Full breakdown (calories, protein, carbs, fat, fibre) for any Indian or international dish |
| 🍽️ **Meal Planner** | AI-generated 1–7 day plans (vegetarian / vegan / non-veg, region-specific) |
| ⚖️ **BMI Calculator** | BMI + TDEE + animated gauge + AI dietary advice |
| 👨‍👩‍👧 **Family Profiles** | Per-member profiles; chat context automatically adjusts |
| 🎛 **Agent Instructions** | Single `AGENT_INSTRUCTIONS` block in `app.py` to tune tone, safety rules, Indian preferences |

---

## 🗂 Project Structure

```
nutrition-agent/
├── app.py                  # Flask backend + IBM watsonx.ai integration
├── requirements.txt        # Python dependencies
├── .env.example            # Template for secrets (never commit .env)
├── .gitignore
├── README.md
├── templates/
│   └── index.html          # SPA HTML shell (links to CSS + JS)
└── static/
    ├── css/
    │   └── style.css       # Premium dark theme (all styling)
    ├── js/
    │   └── script.js       # Full frontend logic
    └── images/
        └── logo.png        # DynoNutriAI logo
```

---

## ⚡ Quick Start

### 1. Enter the project directory

```bash
cd nutrition-agent
```

### 2. Create a virtual environment

```bash
python -m venv venv

# Linux / macOS
source venv/bin/activate

# Windows (PowerShell)
.\venv\Scripts\Activate.ps1
```

### 3. Install dependencies

```bash
pip install -r requirements.txt
```

### 4. Configure environment variables

```bash
cp .env.example .env
```

Open `.env` and fill in:

| Variable | Where to find |
|---|---|
| `IBM_API_KEY` | [IBM Cloud Console → Manage → Access → API keys](https://cloud.ibm.com/iam/apikeys) |
| `IBM_CLOUD_URL` | Your watsonx.ai regional endpoint (default: `https://us-south.ml.cloud.ibm.com`) |
| `WATSONX_PROJECT_ID` | [watsonx.ai Studio → Project → Manage → General](https://dataplatform.cloud.ibm.com/) |
| `WATSONX_MODEL_ID` | e.g. `ibm/granite-3-3-8b-instruct` |
| `FLASK_SECRET_KEY` | Any long random string |

### 5. Run the application

```bash
python app.py
```

Open **http://localhost:5000** in your browser.

---

## 🔑 Getting IBM watsonx.ai Credentials

### IBM API Key

1. Log in to [https://cloud.ibm.com](https://cloud.ibm.com)
2. Go to **Manage → Access (IAM) → API keys**
3. Click **Create an IBM Cloud API key**
4. Copy the key (shown only once) into `IBM_API_KEY`

### watsonx.ai Project ID

1. Open [IBM watsonx.ai](https://dataplatform.cloud.ibm.com/)
2. Create or open a **Project**
3. Go to **Manage → General**
4. Copy the **Project ID**

### Regional Cloud URL

| Region | URL |
|---|---|
| US South (Dallas) | `https://us-south.ml.cloud.ibm.com` |
| EU Germany (Frankfurt) | `https://eu-de.ml.cloud.ibm.com` |
| UK South (London) | `https://eu-gb.ml.cloud.ibm.com` |
| Asia Pacific (Tokyo) | `https://jp-tok.ml.cloud.ibm.com` |

---

## 🎛 Customising Agent Behaviour

Open [`app.py`](app.py) and find the `AGENT_INSTRUCTIONS` block (~line 65).
Edit the sub-sections freely:

```python
AGENT_INSTRUCTIONS = """
...

PERSONA & TONE
━━━━━━━━━━━━━━
- Change the name, tone, or language style here

INDIAN FOOD PREFERENCES
━━━━━━━━━━━━━━━━━━━━━━━
- Add/remove food items, spices, or regional preferences

SAFETY & ETHICAL RULES
━━━━━━━━━━━━━━━━━━━━━━
- Add custom guardrails or domain restrictions

"""
```

Changes take effect **immediately** (no rebuild needed in dev mode).

---

## 🌿 Supported Granite Models

| Model ID | Notes |
|---|---|
| `ibm/granite-3-3-8b-instruct` | ✅ Recommended — fast, accurate |
| `ibm/granite-3-2-8b-instruct` | Good alternative |
| `ibm/granite-13b-chat-v2` | Larger, richer responses |

Set `WATSONX_MODEL_ID` in `.env` to switch.

---

## 📡 API Reference

| Endpoint | Method | Description |
|---|---|---|
| `GET /` | GET | Serve the frontend |
| `POST /api/chat` | POST | Chat with DynoNutriAI |
| `POST /api/meal-plan` | POST | Generate a meal plan |
| `POST /api/nutrition` | POST | Analyse a meal's nutrition |
| `POST /api/bmi` | POST | Calculate BMI + TDEE + AI advice |
| `GET /api/health` | GET | Configuration health check |

### Example — Chat

```bash
curl -X POST http://localhost:5000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Suggest a high-protein Indian breakfast"}'
```

### Example — BMI

```bash
curl -X POST http://localhost:5000/api/bmi \
  -H "Content-Type: application/json" \
  -d '{"weight":70,"height":170,"age":30,"gender":"male","activity":"moderate","goal":"lose weight"}'
```

---

## 🚀 Deployment

### Option A — Gunicorn (Linux/macOS production)

```bash
gunicorn -w 4 -b 0.0.0.0:5000 app:app
```

### Option B — Docker

```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY . .
EXPOSE 5000
CMD ["gunicorn", "-w", "2", "-b", "0.0.0.0:5000", "app:app"]
```

```bash
docker build -t dynonutriai .
docker run -p 5000:5000 --env-file .env dynonutriai
```

### Option C — Railway / Render / Fly.io

1. Push code to GitHub (ensure `.env` is in `.gitignore`)
2. Connect the repo to your platform
3. Set environment variables in the platform dashboard
4. Deploy — the platform detects Flask automatically

---

## 🔒 Security Notes

- **Never** commit `.env` to git — it's listed in `.gitignore`
- Use platform secrets / environment variable stores in production
- `FLASK_DEBUG=false` in production
- `FLASK_SECRET_KEY` must be a strong random value in production:
  ```bash
  python -c "import secrets; print(secrets.token_hex(32))"
  ```

---

## 🐛 Troubleshooting

| Problem | Fix |
|---|---|
| `IBM_API_KEY and WATSONX_PROJECT_ID must be set` | Fill in `.env` correctly |
| `403 Forbidden` from watsonx | Check your API key permissions; ensure the project has watsonx.ai access |
| `Model not found` | Verify `WATSONX_MODEL_ID` is an available Granite model for your region |
| Slow responses | Increase `AGENT_MAX_TOKENS` cautiously; Granite 8B is fastest |
| Port already in use | Change `FLASK_PORT` in `.env` |

---

## 📄 License

MIT — free to use, modify, and distribute.

---

*Made with ❤️ using IBM watsonx.ai Granite models*
