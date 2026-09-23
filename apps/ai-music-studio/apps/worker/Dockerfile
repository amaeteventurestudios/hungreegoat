FROM hg-studio-windmill:1.817.0-source
USER root
COPY studio_worker /opt/studio/worker/studio_worker
RUN chmod -R a+rX /opt/studio/worker
USER studio
