FROM hg-studio-windmill:1.817.0-source
USER root
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg libsndfile1 && rm -rf /var/lib/apt/lists/*
RUN python -m pip install --no-cache-dir librosa==0.11.0 soundfile==0.13.1
RUN python -m pip install --no-cache-dir torch==2.4.1 torchaudio==2.4.1 --index-url https://download.pytorch.org/whl/cpu
RUN python -m pip install --no-cache-dir demucs==4.0.1
RUN python -m pip install --no-cache-dir matchering==2.0.6
ENV TORCH_HOME=/opt/studio/torch
RUN mkdir -p /opt/studio/torch && python -c "from demucs.pretrained import get_model; get_model('htdemucs')" && chmod -R a+rX /opt/studio/torch
COPY studio_worker /opt/studio/worker/studio_worker
RUN chmod -R a+rX /opt/studio/worker
USER studio
