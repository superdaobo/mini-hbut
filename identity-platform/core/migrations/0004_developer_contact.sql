-- #687：oauth_applications 补 contact 列（开发者联系方式，PATCH 白名单此前缺失导致无法落库）
-- 可空 TEXT：历史应用无联系方式时为 NULL；展示层以「—」呈现
ALTER TABLE oauth_applications ADD COLUMN IF NOT EXISTS contact TEXT;
