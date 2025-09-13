import os
import cv2
import threading
import speech_recognition as sr
from transformers import pipeline, logging
import pyttsx3
from deepface import DeepFace
import warnings

# ------------------- SUPPRESS WARNINGS -------------------
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '3'
os.environ['TF_ENABLE_ONEDNN_OPTS'] = '0'
logging.set_verbosity_error()
warnings.filterwarnings("ignore")

# ------------------- SETUP -------------------
face_cascade = cv2.CascadeClassifier(
    cv2.data.haarcascades + 'haarcascade_frontalface_default.xml'
)
window_name = "Smart Glass Simulation"

recognizer = sr.Recognizer()

# Emotion classifier
emotion_classifier = pipeline(
    "text-classification",
    model="bhadresh-savani/distilbert-base-uncased-emotion",
    return_all_scores=False,
    device=-1
)

# Text generation for conversation and advice
response_generator = pipeline(
    "text2text-generation",
    model="google/flan-t5-small",
    device=-1
)

# Text-to-speech engine
engine = pyttsx3.init()
engine.setProperty('rate', 120)

running = True
face_emotion_global = "neutral"


def text_to_speech(text):
    """Speak the text aloud."""
    if text:
        engine.say(text)
        engine.runAndWait()


def generate_response(user_input, face_emotion, voice_emotion, advice_mode=False):
    """Generate conversational response or advice."""
    if advice_mode:
        prompt = (
            f"The person looks {face_emotion} and sounds {voice_emotion}. "
            f"They said: '{user_input}'. "
            "Give a short, clear, empathetic, supportive advice suitable for an autistic listener."
        )
    else:
        prompt = (
            f"The person looks {face_emotion} and sounds {voice_emotion}. "
            f"They said: '{user_input}'. "
            "Suggest a short, exact, friendly, simple response for the autistic listener to say. "
            "Start with 'You can say:' and make it literal and easy to speak."
        )

    try:
        result = response_generator(prompt, max_length=50)
        return result[0]['generated_text']
    except Exception as e:
        return f"Error generating response: {e}"


def analyse_voice():
    """Continuously listen and provide audio response, keeping printed output."""
    global running
    while running:
        try:
            with sr.Microphone() as source:
                print("🎤 Listening...")
                audio = recognizer.listen(source, timeout=5, phrase_time_limit=7)
                speech_text = recognizer.recognize_google(audio).lower()
                print(f"🗣️ You said: {speech_text}")

                if "bye" in speech_text:
                    print("👋 Goodbye detected. Closing program...")
                    running = False
                    text_to_speech("Goodbye! Take care!")
                    break

                voice_emotion = emotion_classifier(speech_text)[0]["label"]

                if "advice" in speech_text:
                    # Generate advice
                    advice = generate_response(
                        speech_text, face_emotion_global, voice_emotion, advice_mode=True
                    )
                    print(f"💡 Advice: {advice}")
                    text_to_speech(advice)
                else:
                    # Generate conversation suggestion
                    suggestion = generate_response(
                        speech_text, face_emotion_global, voice_emotion, advice_mode=False
                    )
                    print(f"💬 {suggestion}")
                    text_to_speech(suggestion)

        except sr.UnknownValueError:
            print("❌ Could not understand audio.")
        except sr.WaitTimeoutError:
            print("⌛ Listening timeout...")
        except Exception as e:
            print(f"⚠️ Error: {e}")


def video_loop():
    """Capture video, detect faces, and analyse emotions."""
    global running, face_emotion_global
    cap = cv2.VideoCapture(0)

    while running:
        ret, frame = cap.read()
        if not ret:
            break

        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        faces = face_cascade.detectMultiScale(gray, 1.3, 5)

        for (x, y, w, h) in faces:
            face = frame[y:y + h, x:x + w]
            try:
                analysis = DeepFace.analyze(face, actions=['emotion'], enforce_detection=False)
                face_emotion_global = analysis[0]["dominant_emotion"]
                cv2.putText(frame, f"Emotion: {face_emotion_global}", (x, y - 10),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
            except Exception:
                pass

            cv2.rectangle(frame, (x, y), (x + w, y + h), (255, 0, 0), 2)

        # Display the video feed
        cv2.imshow(window_name, frame)
        if cv2.waitKey(1) & 0xFF == ord('q'):
            running = False
            break

    cap.release()
    cv2.destroyAllWindows()


# ------------------- MAIN -------------------
if __name__ == "__main__":
    # Start voice processing in a separate thread
    voice_thread = threading.Thread(target=analyse_voice, daemon=True)
    voice_thread.start()

    # Run video loop in main thread
    video_loop()

    running = False
    voice_thread.join()
