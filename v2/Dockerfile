FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
# libgl1-mesa-glx is often needed for opencv/pillow features, though Pillow is usually fine.
# We'll keep it simple for now.

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Create necessary directories for persistence
RUN mkdir -p uploads manuals

# Expose the port
EXPOSE 5000

# Set environment variables
ENV PYTHONUNBUFFERED=1

# Run with Gunicorn
CMD ["gunicorn", "--bind", "0.0.0.0:5000", "--workers", "4", "--timeout", "120", "app:app"]
