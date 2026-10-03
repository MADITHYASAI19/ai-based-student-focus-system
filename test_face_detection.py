"""
Simple test script to verify face detection is working.
Run this to check if MediaPipe can detect your face before using the full tracker.
"""
import cv2
import mediapipe as mp
import time

print("Testing MediaPipe Face Detection...")
print("Press 'q' to quit")

# Initialize MediaPipe FaceMesh
try:
    face_mesh = mp.solutions.face_mesh.FaceMesh(
        max_num_faces=3,
        refine_landmarks=True,
        min_detection_confidence=0.5,
        min_tracking_confidence=0.5
    )
    print("✓ MediaPipe FaceMesh initialized successfully")
except Exception as e:
    print(f"✗ Failed to initialize FaceMesh: {e}")
    exit(1)

# Open camera
cap = cv2.VideoCapture(0)
if not cap.isOpened():
    print("✗ Could not open camera")
    exit(1)

print("✓ Camera opened successfully")
print("Look at the camera to see if your face is detected...")

frame_count = 0
last_print_time = time.time()

try:
    while True:
        ok, frame = cap.read()
        if not ok:
            print("✗ Failed to read frame")
            break
        
        frame = cv2.flip(frame, 1)
        h, w = frame.shape[:2]
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        
        # Process frame
        res_mesh = face_mesh.process(rgb)
        
        frame_count += 1
        
        # Check if face detected
        if res_mesh.multi_face_landmarks:
            face_count = len(res_mesh.multi_face_landmarks)
            cv2.putText(frame, f"Faces: {face_count}", (10, 30),
                       cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 2)
            cv2.putText(frame, "✓ Face Detected", (10, 70),
                       cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 2)
            
            # Print status every 2 seconds
            if time.time() - last_print_time > 2.0:
                print(f"✓ Face detected! Total frames processed: {frame_count}")
                last_print_time = time.time()
        else:
            cv2.putText(frame, "Faces: 0", (10, 30),
                       cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 255), 2)
            cv2.putText(frame, "✗ No Face", (10, 70),
                       cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 255), 2)
            
            if time.time() - last_print_time > 2.0:
                print(f"✗ No face detected. Total frames processed: {frame_count}")
                last_print_time = time.time()
        
        cv2.imshow("Face Detection Test", frame)
        
        if cv2.waitKey(1) & 0xFF == ord('q'):
            break

except KeyboardInterrupt:
    print("\nInterrupted by user")

finally:
    cap.release()
    cv2.destroyAllWindows()
    print(f"\nTest complete. Total frames processed: {frame_count}")
