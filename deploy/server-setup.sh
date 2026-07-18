#!/usr/bin/env bash
#
# One-time root setup for lab.yusufdariyemez.com.
#
# Run this ONCE, as root, AFTER the DNS record for lab.yusufdariyemez.com
# resolves. Everything after this is handled by .github/workflows/deploy.yml,
# which runs as the unprivileged `site` user and needs no root at all — a
# release is just a symlink swap inside a directory that user owns.
#
#   scp deploy/server-setup.sh root@<host>:/tmp/
#   ssh root@<host> 'bash /tmp/server-setup.sh'
#
# It touches nothing outside /opt/lab and the one new nginx vhost. The other
# sites on this box are not modified.

set -euo pipefail

DOMAIN="lab.yusufdariyemez.com"
APP_DIR="/opt/lab"
APP_USER="site"

echo "==> creating $APP_DIR (owned by $APP_USER)"
mkdir -p "$APP_DIR/releases"
chown -R "$APP_USER:$APP_USER" "$APP_DIR"

# A placeholder release so nginx has a valid root before the first deploy —
# otherwise `nginx -t` passes but certbot's HTTP-01 challenge hits a 404.
if [ ! -e "$APP_DIR/current" ]; then
  echo "==> seeding a placeholder release"
  mkdir -p "$APP_DIR/releases/bootstrap"
  echo '<!doctype html><title>lab</title><p>Not deployed yet.' \
    > "$APP_DIR/releases/bootstrap/index.html"
  ln -sfn "$APP_DIR/releases/bootstrap" "$APP_DIR/current"
  chown -R "$APP_USER:$APP_USER" "$APP_DIR"
fi

echo "==> writing the nginx vhost"
cat > "/etc/nginx/sites-available/$DOMAIN" <<EOF
server {
    listen 80;
    server_name $DOMAIN;

    root $APP_DIR/current;
    index index.html;

    # The build prerenders one directory per route (dist/kafka/index.html), so
    # nginx answers a bare /kafka with a 301 that adds the trailing slash. That
    # redirect must be relative: Cloudflare terminates TLS, so nginx believes it
    # is serving plain HTTP and an absolute Location would send the visitor to
    # http://, downgrading the scheme on every prerendered route.
    absolute_redirect off;

    # Prerendered routes are served from their directory; anything unknown falls
    # back to the app document rather than 404, which is what keeps client-side
    # routes working on a fresh load.
    location / {
        try_files \$uri \$uri/ /index.html;
    }

    # Vite emits content-hashed filenames, so these can never go stale.
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # The document itself must not be cached, or a deploy would not be visible.
    location = /index.html {
        add_header Cache-Control "no-cache";
    }
}
EOF

ln -sfn "/etc/nginx/sites-available/$DOMAIN" "/etc/nginx/sites-enabled/$DOMAIN"

echo "==> testing and reloading nginx"
nginx -t
systemctl reload nginx

echo "==> requesting a certificate"
# --no-redirect is deliberate. Cloudflare in Flexible mode reaches the origin
# over plain HTTP; if the origin then redirects to HTTPS, the request loops
# between the two forever. Harmless once Cloudflare is on Full (strict), but
# there is no upside to letting certbot add the redirect either way.
certbot --nginx -d "$DOMAIN" --no-redirect

echo
echo "done. $APP_DIR is owned by $APP_USER, so deploys need no root from here."
echo "publish a release on github.com/YusufDrymz/lab to ship the first build."
