FROM hg-studio-windmill:1.817.0-source
USER root
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg libsndfile1 && rm -rf /var/lib/apt/lists/*
RUN python -m pip install --no-cache-dir librosa==0.11.0 soundfile==0.13.1
COPY studio_worker /opt/studio/worker/studio_worker
RUN chmod -R a+rX /opt/studio/worker
USER studio
