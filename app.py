"""
AI-Powered Nutrition Agent — Flask Backend
==========================================
Powered by IBM watsonx.ai  +  Granite Models
"""

import os
import json
import re
import math
from datetime import datetime
from dotenv import load_dotenv
from flask import Flask, request, jsonify, render_template, session
from flask_cors import CORS

# ── Load environment ──────────────────────────────────────────────────────────
load_dotenv()

app = Flask(__name__)
app.secret_key = os.getenv("FLASK_SECRET_KEY", "dev-secret-key-change-in-prod")
CORS(app)

# ── watsonx.ai client (lazy-initialised) ─────────────────────────────────────
_wx_client = None

def get_watsonx_client():
    """Return a cached ModelInference client."""
    global _wx_client
    if _wx_client is not None:
        return _wx_client

    from ibm_watsonx_ai import APIClient, Credentials
    from ibm_watsonx_ai.foundation_models import ModelInference

    api_key   = os.getenv("IBM_API_KEY")
    cloud_url = os.getenv("IBM_CLOUD_URL", "https://us-south.ml.cloud.ibm.com")
    project   = os.getenv("WATSONX_PROJECT_ID")
    model_id  = os.getenv("WATSONX_MODEL_ID", "ibm/granite-3-3-8b-instruct")

    if not api_key or not project:
        raise EnvironmentError(
            "IBM_API_KEY and WATSONX_PROJECT_ID must be set in .env"
        )

    credentials = Credentials(url=cloud_url, api_key=api_key)
    params = {
        "max_new_tokens": int(os.getenv("AGENT_MAX_TOKENS", 1024)),
        "temperature":    float(os.getenv("AGENT_TEMPERATURE", 0.7)),
        "top_p":          float(os.getenv("AGENT_TOP_P", 0.9)),
        "stop_sequences": ["<|endoftext|>", "</s>"],
    }
    _wx_client = ModelInference(
        model_id=model_id,
        credentials=credentials,
        project_id=project,
        params=params,
    )
    return _wx_client


# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║                        AGENT INSTRUCTIONS                                  ║
# ║  Edit this section to customise behaviour, tone, safety rules,             ║
# ║  dietary preferences, and response style.                                  ║
# ╚══════════════════════════════════════════════════════════════════════════════╝

AGENT_INSTRUCTIONS = """
You are DynoNutriAI, an expert AI Nutrition Agent specialising in personalised dietary advice.

━━━━━━━━━━━━━━━━━━━━━━━━━━
PERSONA & TONE
━━━━━━━━━━━━━━━━━━━━━━━━━━
- Warm, encouraging, non-judgmental, and science-backed.
- Use simple, jargon-free language.
- Address the user by first name when available.
- Keep answers concise (3-5 sentences unless a detailed plan is requested).
- Use bullet points for meal plans or food lists.

━━━━━━━━━━━━━━━━━━━━━━━━━━
EXPERTISE AREAS
━━━━━━━━━━━━━━━━━━━━━━━━━━
- Macronutrient & micronutrient guidance
- Indian cuisine nutritional analysis (Roti, Dal, Sabzi, Biryani, Idli, Dosa, Thali, Chaat, etc.)
- Caloric estimates for both Indian and international foods
- Healthy Indian cooking tips (less oil, air-frying, steaming)
- Diabetic-friendly, heart-healthy, and weight-loss Indian meal plans
- Ayurvedic food principles (when asked)
- Hydration, sleep, and lifestyle advice alongside nutrition

━━━━━━━━━━━━━━━━━━━━━━━━━━
INDIAN FOOD PREFERENCES
━━━━━━━━━━━━━━━━━━━━━━━━━━
- Prioritise Indian recipes and ingredients in suggestions.
- Common Indian staples to recommend: dal, sabzi, roti, rice, curd, buttermilk,
  sprouts, poha, upma, idli, sambar, rajma, chhole, paneer, tofu.
- Suggest Indian spices for health benefits: turmeric, cumin, coriander, fenugreek,
  ginger, garlic, black pepper, cardamom.
- Always offer a vegetarian option first; mention non-veg as an alternative.
- Respect regional variations (North Indian, South Indian, Gujarati, Bengali, etc.).
- Suggest affordable, locally available ingredients.

━━━━━━━━━━━━━━━━━━━━━━━━━━
FAMILY PROFILE HANDLING
━━━━━━━━━━━━━━━━━━━━━━━━━━
- When a family profile is provided, tailor advice to each member.
- For children (<18): focus on growth nutrients (calcium, iron, protein).
- For seniors (>60): emphasise bone health, low-sodium, easy digestion.
- For pregnant/lactating women: highlight folic acid, iron, DHA.
- For diabetics: low-glycaemic index foods, portion control.

━━━━━━━━━━━━━━━━━━━━━━━━━━
SAFETY & ETHICAL RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━
- NEVER diagnose medical conditions or prescribe medication.
- Always recommend consulting a registered dietitian or doctor for medical issues.
- Do not promote extreme diets, starvation, or unhealthy weight-loss methods.
- Avoid recommending supplements without noting "consult your doctor first."
- If a user reports symptoms (chest pain, severe dizziness, etc.), advise immediate
  medical attention.
- Be sensitive to eating disorders — avoid calorie-obsessive language if detected.
- Do not generate harmful, offensive, or politically sensitive content.

━━━━━━━━━━━━━━━━━━━━━━━━━━
RESPONSE FORMAT RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━
- For meal plans: use Day 1 / Day 2 headers and Breakfast / Lunch / Dinner / Snacks.
- For nutrition info: list Calories, Protein, Carbs, Fat, Fibre per serving.
- For BMI feedback: state the category and give 2-3 actionable tips.
- End every response with a short motivational nudge (1 sentence).
- Use emojis sparingly (max 2 per message) to keep the tone friendly.
"""

# ── Helpers ───────────────────────────────────────────────────────────────────

def build_system_prompt(family_profile=None):
    """Assemble the full system prompt including optional family context."""
    prompt = AGENT_INSTRUCTIONS.strip()
    if family_profile:
        members_text = "\n".join(
            f"  - {m['name']}, {m['age']} yrs, {m.get('goal','')}, "
            f"dietary: {m.get('diet','Not specified')}, "
            f"conditions: {m.get('conditions','None')}"
            for m in family_profile
        )
        prompt += f"""

━━━━━━━━━━━━━━━━━━━━━━━━━━
ACTIVE FAMILY PROFILE
━━━━━━━━━━━━━━━━━━━━━━━━━━
{members_text}
Tailor all advice to the needs of this family.
"""
    return prompt


def build_full_prompt(system_prompt, history, user_message):
    """
    Format conversation for Granite instruct models.
    Uses the <|system|> / <|user|> / <|assistant|> chat template.
    """
    parts = [f"<|system|>\n{system_prompt}\n<|endoftext|>"]
    for turn in history[-10:]:          # keep last 10 turns for context
        role = turn.get("role", "user")
        content = turn.get("content", "")
        if role == "user":
            parts.append(f"<|user|>\n{content}\n<|endoftext|>")
        else:
            parts.append(f"<|assistant|>\n{content}\n<|endoftext|>")
    parts.append(f"<|user|>\n{user_message}\n<|endoftext|>")
    parts.append("<|assistant|>")
    return "\n".join(parts)


def bmi_category(bmi: float) -> str:
    if bmi < 18.5:
        return "Underweight"
    elif bmi < 25.0:
        return "Normal weight"
    elif bmi < 30.0:
        return "Overweight"
    else:
        return "Obese"


def calculate_tdee(weight_kg, height_cm, age, gender, activity):
    """Harris-Benedict BMR → TDEE."""
    if gender.lower() == "female":
        bmr = 655.1 + 9.563 * weight_kg + 1.850 * height_cm - 4.676 * age
    else:
        bmr = 66.47 + 13.75 * weight_kg + 5.003 * height_cm - 6.755 * age

    activity_map = {
        "sedentary":    1.2,
        "light":        1.375,
        "moderate":     1.55,
        "active":       1.725,
        "very_active":  1.9,
    }
    return round(bmr * activity_map.get(activity, 1.55))


# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║                              ROUTES                                        ║
# ╚══════════════════════════════════════════════════════════════════════════════╝

@app.route("/")
def index():
    return render_template("index.html")


# ── Chat endpoint ─────────────────────────────────────────────────────────────

@app.route("/api/chat", methods=["POST"])
def chat():
    """Main conversational endpoint."""
    data           = request.get_json(force=True)
    user_message   = (data.get("message") or "").strip()
    history        = data.get("history", [])
    family_profile = data.get("family_profile")

    if not user_message:
        return jsonify({"error": "Empty message"}), 400

    try:
        client        = get_watsonx_client()
        system_prompt = build_system_prompt(family_profile)
        full_prompt   = build_full_prompt(system_prompt, history, user_message)
        result        = client.generate_text(prompt=full_prompt)

        # Strip any residual chat-template tokens
        reply = re.sub(r"<\|.*?\|>", "", result).strip()

        return jsonify({
            "reply":     reply,
            "timestamp": datetime.now().isoformat(),
            "model":     os.getenv("WATSONX_MODEL_ID", "ibm/granite-3-3-8b-instruct"),
        })

    except EnvironmentError as env_err:
        return jsonify({"error": str(env_err), "type": "config_error"}), 503
    except Exception as exc:
        return jsonify({"error": f"Agent error: {str(exc)}", "type": "agent_error"}), 500


# ── Meal Plan endpoint ────────────────────────────────────────────────────────

@app.route("/api/meal-plan", methods=["POST"])
def meal_plan():
    """Generate a structured N-day meal plan."""
    data   = request.get_json(force=True)
    days   = min(int(data.get("days", 7)), 7)
    goal   = data.get("goal", "balanced healthy eating")
    diet   = data.get("diet", "vegetarian")
    region = data.get("region", "North Indian")
    tdee   = data.get("tdee", 2000)
    family_profile = data.get("family_profile")

    prompt_text = (
        f"Create a detailed {days}-day Indian meal plan.\n"
        f"Dietary preference: {diet}\n"
        f"Cuisine region: {region}\n"
        f"Health goal: {goal}\n"
        f"Daily calorie target: ~{tdee} kcal\n\n"
        "For each day provide: Breakfast, Mid-Morning Snack, Lunch, Evening Snack, Dinner.\n"
        "Include approximate calories per meal. Use Indian food items.\n"
        "Format each day as:\n"
        "**Day X**\n"
        "- Breakfast: ...\n"
        "- Mid-Morning: ...\n"
        "- Lunch: ...\n"
        "- Evening Snack: ...\n"
        "- Dinner: ...\n"
        "- Daily Total: ~X kcal\n"
    )

    try:
        client        = get_watsonx_client()
        system_prompt = build_system_prompt(family_profile)
        full_prompt   = build_full_prompt(system_prompt, [], prompt_text)
        result        = client.generate_text(prompt=full_prompt)
        reply         = re.sub(r"<\|.*?\|>", "", result).strip()

        return jsonify({"meal_plan": reply, "days": days, "goal": goal})

    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


# ── Nutrition Analysis endpoint ───────────────────────────────────────────────

@app.route("/api/nutrition", methods=["POST"])
def nutrition_analysis():
    """Analyse the nutritional content of a described meal."""
    data      = request.get_json(force=True)
    meal_desc = (data.get("meal") or "").strip()

    if not meal_desc:
        return jsonify({"error": "Meal description required"}), 400

    prompt_text = (
        f"Analyse the nutritional content of: {meal_desc}\n\n"
        "Provide a structured breakdown:\n"
        "**Nutritional Information (per serving)**\n"
        "- Calories: X kcal\n"
        "- Protein: X g\n"
        "- Carbohydrates: X g\n"
        "- Fat: X g\n"
        "- Fibre: X g\n"
        "- Key Vitamins/Minerals: ...\n\n"
        "**Health Score** (1-10): X\n"
        "**Benefits**: ...\n"
        "**Suggestions to improve**: ...\n"
    )

    try:
        client      = get_watsonx_client()
        full_prompt = build_full_prompt(AGENT_INSTRUCTIONS, [], prompt_text)
        result      = client.generate_text(prompt=full_prompt)
        reply       = re.sub(r"<\|.*?\|>", "", result).strip()

        return jsonify({"analysis": reply, "meal": meal_desc})

    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


# ── BMI Calculator endpoint ───────────────────────────────────────────────────

@app.route("/api/bmi", methods=["POST"])
def bmi_calculator():
    """Calculate BMI, TDEE and return AI-generated personalised advice."""
    data       = request.get_json(force=True)
    weight     = float(data.get("weight", 0))
    height_cm  = float(data.get("height", 0))
    age        = int(data.get("age", 25))
    gender     = data.get("gender", "male")
    activity   = data.get("activity", "moderate")
    goal       = data.get("goal", "maintain weight")

    if weight <= 0 or height_cm <= 0:
        return jsonify({"error": "Valid weight and height required"}), 400

    height_m = height_cm / 100
    bmi      = round(weight / (height_m ** 2), 1)
    category = bmi_category(bmi)
    tdee     = calculate_tdee(weight, height_cm, age, gender, activity)

    # Calorie target based on goal
    calorie_targets = {
        "lose weight":     tdee - 500,
        "gain weight":     tdee + 300,
        "maintain weight": tdee,
        "build muscle":    tdee + 200,
    }
    target_calories = calorie_targets.get(goal, tdee)

    prompt_text = (
        f"Person profile: Age {age}, {gender}, Weight {weight} kg, "
        f"Height {height_cm} cm, BMI {bmi} ({category}), "
        f"Activity level: {activity}, Goal: {goal}, "
        f"Daily calorie need: ~{tdee} kcal.\n\n"
        "Provide: (1) a brief BMI assessment, "
        "(2) 3 specific Indian dietary tips for their goal, "
        "(3) one simple Indian meal idea for today."
    )

    try:
        client      = get_watsonx_client()
        full_prompt = build_full_prompt(AGENT_INSTRUCTIONS, [], prompt_text)
        result      = client.generate_text(prompt=full_prompt)
        ai_advice   = re.sub(r"<\|.*?\|>", "", result).strip()

    except Exception as exc:
        ai_advice = f"Could not generate AI advice: {exc}"

    return jsonify({
        "bmi":             bmi,
        "category":        category,
        "tdee":            tdee,
        "target_calories": target_calories,
        "weight":          weight,
        "height":          height_cm,
        "age":             age,
        "gender":          gender,
        "activity":        activity,
        "goal":            goal,
        "ai_advice":       ai_advice,
    })


# ── Health check ──────────────────────────────────────────────────────────────

@app.route("/api/health", methods=["GET"])
def health_check():
    config_ok = bool(
        os.getenv("IBM_API_KEY") and os.getenv("WATSONX_PROJECT_ID")
    )
    return jsonify({
        "status":   "ok" if config_ok else "misconfigured",
        "model":    os.getenv("WATSONX_MODEL_ID", "not set"),
        "project":  "configured" if os.getenv("WATSONX_PROJECT_ID") else "missing",
        "api_key":  "configured" if os.getenv("IBM_API_KEY") else "missing",
        "time":     datetime.now().isoformat(),
    })


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    port  = int(os.getenv("FLASK_PORT", 5000))
    debug = os.getenv("FLASK_DEBUG", "true").lower() == "true"
    print(f"\n🌿 DynoNutriAI starting on http://localhost:{port}")
    print(f"   Model : {os.getenv('WATSONX_MODEL_ID', 'ibm/granite-3-3-8b-instruct')}")
    print(f"   Debug : {debug}\n")
    app.run(host="0.0.0.0", port=port, debug=debug)
