#!/bin/sh
echo "window.BACKEND_URL='${BACKEND_URL}';" > /usr/share/nginx/html/config.js
nginx -g 'daemon off;'
