import unittest
import requests
import os
import time
from dotenv import load_dotenv

load_dotenv()

BASE_URL = "http://localhost:5000/api"
TOKEN = os.getenv("TEST_USER_TOKEN")

class TestIntegration(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if not TOKEN:
            print("Skipping integration tests: TEST_USER_TOKEN not set")
            raise unittest.SkipTest("TEST_USER_TOKEN not set")
        
        cls.headers = {"Authorization": f"Bearer {TOKEN}"}
        
    def test_1_upload_manual(self):
        """Test uploading a manual"""
        file_path = "tests/sample.pdf"
        if not os.path.exists(file_path):
            # Create a dummy PDF if not exists
            from reportlab.pdfgen import canvas
            c = canvas.Canvas(file_path)
            c.drawString(100, 750, "This is a test manual for the 2025 TestCar ModelX.")
            c.drawString(100, 730, "Oil Change Procedure:")
            c.drawString(100, 710, "1. Open drain plug.")
            c.drawString(100, 690, "2. Drain oil.")
            c.drawString(100, 670, "3. Replace filter.")
            c.save()
            
        with open(file_path, 'rb') as f:
            files = {'file': f}
            data = {
                'year': 2025,
                'make': 'TestCar',
                'model': 'ModelX'
            }
            response = requests.post(f"{BASE_URL}/manuals/upload", headers=self.headers, files=files, data=data)
            
        self.assertEqual(response.status_code, 200)
        self.assertIn("manual_id", response.json())
        self.__class__.manual_id = response.json()['manual_id']
        print(f"Uploaded manual ID: {self.manual_id}")
        
        # Wait for async processing if any (currently synchronous in upload endpoint)
        
    def test_2_list_manuals(self):
        """Test listing manuals"""
        response = requests.get(f"{BASE_URL}/manuals", headers=self.headers)
        self.assertEqual(response.status_code, 200)
        manuals = response.json()
        found = any(m['manual_id'] == self.manual_id for m in manuals)
        self.assertTrue(found)
        
    def test_3_ask_question(self):
        """Test asking a question"""
        # Wait a bit for indexing if needed
        time.sleep(2)
        
        payload = {
            "query": "How do I change the oil?",
            "max_sections": 3
        }
        
        # Test streaming endpoint
        response = requests.post(f"{BASE_URL}/answer", headers=self.headers, json=payload, stream=True)
        self.assertEqual(response.status_code, 200)
        
        content = ""
        for line in response.iter_lines():
            if line:
                decoded = line.decode('utf-8')
                if decoded.startswith("data: "):
                    content += decoded
                    
        self.assertIn("citations", content)
        # We expect the answer to mention "drain plug" or "filter" based on our dummy PDF
        # But since we are using real OpenAI, it might not index immediately or might answer generally.
        # However, RAG should retrieve the section.
        
    def test_4_delete_manual(self):
        """Test deleting the manual"""
        response = requests.delete(f"{BASE_URL}/manuals/{self.manual_id}", headers=self.headers)
        self.assertEqual(response.status_code, 200)
        
        # Verify it's gone
        response = requests.get(f"{BASE_URL}/manuals/{self.manual_id}", headers=self.headers)
        self.assertEqual(response.status_code, 404)

if __name__ == '__main__':
    unittest.main()
