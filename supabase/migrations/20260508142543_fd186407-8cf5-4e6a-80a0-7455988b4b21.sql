
-- Set temporary password and grant admin role
UPDATE auth.users
SET encrypted_password = crypt('TrailForge2026!', gen_salt('bf')),
    email_confirmed_at = COALESCE(email_confirmed_at, now()),
    updated_at = now()
WHERE id = '7bc67709-b9b0-4c0c-861b-63485dc329ec';

INSERT INTO public.user_roles (user_id, role)
VALUES ('7bc67709-b9b0-4c0c-861b-63485dc329ec', 'admin')
ON CONFLICT (user_id, role) DO NOTHING;
