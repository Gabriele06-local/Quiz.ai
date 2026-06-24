FROM node:20-alpine AS builder

WORKDIR /app

COPY scripts/ scripts/
COPY public/supabase-config.js public/supabase-config.js 2>/dev/null || true

ARG SUPABASE_URL
ARG SUPABASE_ANON_KEY
ENV SUPABASE_URL=$SUPABASE_URL \
    SUPABASE_ANON_KEY=$SUPABASE_ANON_KEY \
    NEXT_PUBLIC_SUPABASE_URL=$SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY=$SUPABASE_ANON_KEY

RUN if [ -n "$SUPABASE_URL" ] && [ -n "$SUPABASE_ANON_KEY" ]; then \
      node scripts/generate-supabase-config.mjs; \
    fi

FROM nginx:stable-alpine

COPY --from=builder /app/public/ /usr/share/nginx/html/

COPY <<-EOF /etc/nginx/conf.d/default.conf
server {
    listen       80;
    listen  [::]:80;
    server_name  localhost;

    root   /usr/share/nginx/html;
    index  index.html;

    location / {
        try_files $uri $uri/ =404;
    }

    location /favicon.svg {
        add_header Cache-Control "public, max-age=86400";
    }

    location /assets/ {
        add_header Cache-Control "public, max-age=31536000, immutable";
    }

    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Permissions-Policy "accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()" always;
}
EOF

RUN chmod -R a+r /usr/share/nginx/html/

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
