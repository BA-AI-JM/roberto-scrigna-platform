#!/bin/bash
# Seed local development environment
# Run after: supabase db reset

set -e

SUPABASE_URL="http://127.0.0.1:54321"
ANON_KEY="sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH"
SERVICE_KEY="sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz"

echo "=== Creating Roberto's auth user ==="
SIGNUP_RESULT=$(curl -s -X POST "$SUPABASE_URL/auth/v1/admin/users" \
  -H "apikey: $SERVICE_KEY" \
  -H "Authorization: Bearer $SERVICE_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "roberto@test.com",
    "password": "testpass123",
    "email_confirm": true,
    "user_metadata": {"full_name": "Roberto Scrigna"}
  }')

USER_ID=$(echo "$SIGNUP_RESULT" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ -z "$USER_ID" ]; then
  echo "Failed to create auth user. Response:"
  echo "$SIGNUP_RESULT"
  exit 1
fi

echo "Auth user created: $USER_ID"

echo "=== Creating partner record ==="
curl -s -X POST "$SUPABASE_URL/rest/v1/partner" \
  -H "apikey: $SERVICE_KEY" \
  -H "Authorization: Bearer $SERVICE_KEY" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=minimal" \
  -d "{
    \"auth_user_id\": \"$USER_ID\",
    \"full_name\": \"Roberto Scrigna\",
    \"email\": \"roberto@test.com\",
    \"role\": \"coach\"
  }"

echo "Partner record created"

echo "=== Creating sample clients ==="

# Niccolò Ambrosi
curl -s -X POST "$SUPABASE_URL/rest/v1/client" \
  -H "apikey: $SERVICE_KEY" \
  -H "Authorization: Bearer $SERVICE_KEY" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d "{
    \"partner_id\": \"$(curl -s "$SUPABASE_URL/rest/v1/partner?select=id&email=eq.roberto@test.com" -H "apikey: $SERVICE_KEY" -H "Authorization: Bearer $SERVICE_KEY" | grep -o '"id":"[^"]*"' | cut -d'"' -f4)\",
    \"full_name\": \"Niccolò Ambrosi\",
    \"email\": \"n.ambrosi88@gmail.com\",
    \"date_of_birth\": \"1988-10-05\",
    \"sex\": \"male\",
    \"status\": \"active\",
    \"notes\": \"Ciclista, imprenditore. Ex basket semi-professionista. Obiettivo: 85-86kg.\"
  }" > /dev/null

echo "Client: Niccolò Ambrosi created"

# Raphael Federico
curl -s -X POST "$SUPABASE_URL/rest/v1/client" \
  -H "apikey: $SERVICE_KEY" \
  -H "Authorization: Bearer $SERVICE_KEY" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d "{
    \"partner_id\": \"$(curl -s "$SUPABASE_URL/rest/v1/partner?select=id&email=eq.roberto@test.com" -H "apikey: $SERVICE_KEY" -H "Authorization: Bearer $SERVICE_KEY" | grep -o '"id":"[^"]*"' | cut -d'"' -f4)\",
    \"full_name\": \"Raphael Federico\",
    \"email\": \"raphael.federico2@gmail.com\",
    \"date_of_birth\": \"1999-11-23\",
    \"sex\": \"male\",
    \"status\": \"active\",
    \"notes\": \"MMA Pro fighter. Obiettivo: -66kg match 15 Giugno. Anemia mediterranea, asma allergico.\"
  }" > /dev/null

echo "Client: Raphael Federico created"

echo ""
echo "=== Seed complete ==="
echo "Login: roberto@test.com / testpass123"
