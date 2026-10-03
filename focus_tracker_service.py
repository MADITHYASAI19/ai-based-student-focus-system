"""
Background Focus Tracker Service
Runs the focus tracker independently and sends metrics to the API.
"""
import argparse
import logging
import signal
import sys
import time
import requests
from typing import Optional
import json

from app.services.focus_tracker_service import FocusTracker

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class FocusTrackerService:
    """Background service that runs focus tracker and sends metrics to API."""
    
    def __init__(self, api_base_url: str, session_id: int, camera_id: int = 0, 
                 metrics_interval: float = 2.0, auth_token: Optional[str] = None):
        self.api_base_url = api_base_url.rstrip('/')
        self.session_id = session_id
        self.camera_id = camera_id
        self.metrics_interval = metrics_interval
        self.auth_token = auth_token
        
        self.tracker = FocusTracker(camera_id=camera_id)
        self.running = False
        self.headers = {}
        
        if auth_token:
            self.headers['Authorization'] = f'Bearer {auth_token}'
    
    def start_tracker_via_api(self) -> bool:
        """Start the tracker via API endpoint."""
        try:
            url = f"{self.api_base_url}/api/focus-tracker/start"
            payload = {
                "session_id": self.session_id,
                "camera_id": self.camera_id
            }
            response = requests.post(url, json=payload, headers=self.headers, timeout=10)
            
            if response.status_code == 201:
                logger.info(f"Successfully started tracker via API for session {self.session_id}")
                return True
            else:
                logger.error(f"Failed to start tracker via API: {response.status_code} - {response.text}")
                return False
        except Exception as e:
            logger.error(f"Error starting tracker via API: {e}")
            return False
    
    def stop_tracker_via_api(self) -> bool:
        """Stop the tracker via API endpoint."""
        try:
            url = f"{self.api_base_url}/api/focus-tracker/stop"
            response = requests.post(url, headers=self.headers, timeout=10)
            
            if response.status_code == 200:
                summary = response.json()
                logger.info(f"Successfully stopped tracker. Summary: {summary}")
                return True
            else:
                logger.error(f"Failed to stop tracker via API: {response.status_code} - {response.text}")
                return False
        except Exception as e:
            logger.error(f"Error stopping tracker via API: {e}")
            return False
    
    def send_metrics_to_api(self, metrics: dict) -> bool:
        """Send metrics to API endpoint."""
        try:
            url = f"{self.api_base_url}/api/focus-tracker/metrics"
            payload = {
                "session_id": self.session_id,
                "face_present": metrics.get("face_present", False),
                "face_count": metrics.get("face_count", 0),
                "ear": metrics.get("ear"),
                "eyes_closed": metrics.get("eyes_closed", False),
                "drowsy": metrics.get("drowsy", False),
                "gaze": metrics.get("gaze"),
                "head_pose_status": metrics.get("head_pose_status"),
                "yaw": metrics.get("yaw"),
                "pitch": metrics.get("pitch"),
                "roll": metrics.get("roll"),
                "blink_rate": metrics.get("blink_rate", 0),
                "look_away_duration": metrics.get("look_away_duration"),
                "focus_score": metrics.get("focus_score", 0.0),
                "productivity_score": metrics.get("productivity_score", 0.0),
                "is_focused": metrics.get("is_focused", False)
            }
            response = requests.post(url, json=payload, headers=self.headers, timeout=5)
            
            if response.status_code == 201:
                return True
            else:
                logger.warning(f"Failed to send metrics: {response.status_code} - {response.text}")
                return False
        except Exception as e:
            logger.error(f"Error sending metrics to API: {e}")
            return False
    
    def run(self):
        """Main service loop."""
        logger.info("Starting Focus Tracker Service...")
        
        # Start tracker via API
        if not self.start_tracker_via_api():
            logger.error("Failed to start tracker via API. Exiting.")
            return
        
        # Start local tracker
        if not self.tracker.start(session_id=self.session_id):
            logger.error("Failed to start local tracker. Stopping API tracker and exiting.")
            self.stop_tracker_via_api()
            return
        
        self.running = True
        logger.info("Focus tracker service is running. Press Ctrl+C to stop.")
        
        last_metrics_time = time.time()
        
        try:
            while self.running:
                # Process frame
                metrics = self.tracker.process_frame()
                
                if metrics:
                    # Log current state periodically
                    now = time.time()
                    if now - last_metrics_time >= 10:  # Every 10 seconds
                        logger.info(
                            f"Focus: {metrics['focus_score']:.1f}% | "
                            f"Productivity: {metrics['productivity_score']:.1f}% | "
                            f"Face: {'Yes' if metrics['face_present'] else 'No'} | "
                            f"Gaze: {metrics['gaze']}"
                        )
                        last_metrics_time = now
                    
                    # Send metrics to API at regular intervals
                    if now - metrics.get('timestamp', 0) >= self.metrics_interval:
                        self.send_metrics_to_api(metrics)
                
                # Small sleep to prevent CPU overload
                time.sleep(0.05)
        
        except KeyboardInterrupt:
            logger.info("Received interrupt signal. Shutting down...")
        except Exception as e:
            logger.error(f"Unexpected error in service loop: {e}")
        finally:
            self.shutdown()
    
    def shutdown(self):
        """Graceful shutdown."""
        logger.info("Shutting down Focus Tracker Service...")
        self.running = False
        
        # Stop local tracker
        self.tracker.stop()
        
        # Stop tracker via API
        self.stop_tracker_via_api()
        
        logger.info("Focus Tracker Service stopped.")


def main():
    parser = argparse.ArgumentParser(description="Background Focus Tracker Service")
    parser.add_argument(
        "--api-url",
        default="http://localhost:8000",
        help="Base URL of the API (default: http://localhost:8000)"
    )
    parser.add_argument(
        "--session-id",
        type=int,
        required=True,
        help="Study session ID to track"
    )
    parser.add_argument(
        "--camera-id",
        type=int,
        default=0,
        help="Camera device ID (default: 0)"
    )
    parser.add_argument(
        "--metrics-interval",
        type=float,
        default=2.0,
        help="Interval in seconds to send metrics to API (default: 2.0)"
    )
    parser.add_argument(
        "--auth-token",
        help="JWT auth token for API requests"
    )
    
    args = parser.parse_args()
    
    # Create and run service
    service = FocusTrackerService(
        api_base_url=args.api_url,
        session_id=args.session_id,
        camera_id=args.camera_id,
        metrics_interval=args.metrics_interval,
        auth_token=args.auth_token
    )
    
    # Setup signal handlers for graceful shutdown
    def signal_handler(sig, frame):
        service.shutdown()
        sys.exit(0)
    
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    
    # Run service
    service.run()


if __name__ == "__main__":
    main()
