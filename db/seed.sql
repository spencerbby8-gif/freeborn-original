-- Freeborn founding-member cohort (accounts + user_profiles + profile_photos)

-- Account rows (auth.users analog) for every seeded member
insert into public.accounts (id, email, email_confirmed_at, raw_app_meta_data)
values
  ('0a000000-0000-4000-8000-000000000001', 'preview-visitor@freeborn.local', timezone('utc', now()), '{"provider":"seed"}'::jsonb),
  ('11111111-0000-4000-8000-000000000001', 'mara@freeborn.local', timezone('utc', now()), '{"provider":"seed"}'::jsonb),
  ('11111111-0000-4000-8000-000000000002', 'jonah@freeborn.local', timezone('utc', now()), '{"provider":"seed"}'::jsonb),
  ('11111111-0000-4000-8000-000000000003', 'elena@freeborn.local', timezone('utc', now()), '{"provider":"seed"}'::jsonb),
  ('11111111-0000-4000-8000-000000000004', 'naomi@freeborn.local', timezone('utc', now()), '{"provider":"seed"}'::jsonb),
  ('11111111-0000-4000-8000-000000000005', 'caleb@freeborn.local', timezone('utc', now()), '{"provider":"seed"}'::jsonb)
on conflict (id) do nothing;

-- Anonymous discovery preview anchor (never shown in discovery)
insert into public.user_profiles (id, email, handle, display_name, profile_status, onboarding_stage, onboarding_step, discoverable)
values ('0a000000-0000-4000-8000-000000000001', 'preview-visitor@freeborn.local', 'preview_visitor', 'Preview Visitor', 'draft', 'account_created', 'welcome', false)
on conflict (id) do nothing;

insert into public.user_profiles
  (id, email, display_name, birth_date, gender, city, region, country_code, occupation, bio,
   relationship_goals, "values", interests, lifestyle_preferences, prompt_answers,
   profile_status, onboarding_stage, onboarding_step, is_verified, photo_count, onboarding_completed_at)
values
  ('11111111-0000-4000-8000-000000000001', 'mara@freeborn.local', 'Mara', '1996-08-14', 'woman', 'Austin', 'Texas', 'US', 'Functional nutritionist',
   'Garden mornings, honest conversation, and building a life that feels free.',
   array['long_term'], array['Health autonomy','Natural health'], array['Gardening','Cooking','Holistic wellness'], array['Natural living','Organic food'],
   '[{"prompt":"A value I will not compromise on…","answer":"Informed choice. I want a relationship where we can ask good questions, respect the body, and make health decisions without pressure."}]'::jsonb,
   'active', 'ready', 'finish', true, 1, timezone('utc', now())),
  ('11111111-0000-4000-8000-000000000002', 'jonah@freeborn.local', 'Jonah', '1991-06-14', 'man', 'Boise', 'Idaho', 'US', 'Regenerative farmer',
   'Looking for a woman who wants roots, resilience, and a real home.',
   array['life_partner'], array['Self-reliance','Regenerative agriculture'], array['Farmers markets','Hiking','Traditional food'], array['Homesteading','Outdoorsy','Early bird'],
   '[{"prompt":"My perfect Sunday…","answer":"Sunrise coffee, farmers market, a long walk, meal prep from scratch, and phones away by dinner."}]'::jsonb,
   'active', 'ready', 'finish', true, 1, timezone('utc', now())),
  ('11111111-0000-4000-8000-000000000003', 'elena@freeborn.local', 'Elena', '1994-03-02', 'woman', 'Franklin', 'Tennessee', 'US', 'Midwife',
   'Soft heart, strong standards, and serious about building something lasting.',
   array['long_term','life_partner'], array['Family values','Home birth'], array['Reading','Volunteering','Wellness'], array['Family-minded','Faith-friendly'],
   '[{"prompt":"I''m looking for someone who…","answer":"Lives with conviction, cares about natural health, and wants a peaceful home more than a performative life."}]'::jsonb,
   'active', 'ready', 'finish', false, 1, timezone('utc', now())),
  ('11111111-0000-4000-8000-000000000004', 'naomi@freeborn.local', 'Naomi', '1998-11-21', 'woman', 'Portland', 'Oregon', 'US', 'Herbalist & tea blender',
   'Slow mornings, strong tinctures, and conversations that go somewhere.',
   array['meaningful_connection'], array['Herbal remedies','Body autonomy'], array['Tea drinker','Pottery','Journaling'], array['Natural wellness','Plant parent'],
   '[{"prompt":"We will get along if…","answer":"You believe the kitchen is a pharmacy, the garden is a teacher, and a relationship should be tended like both."}]'::jsonb,
   'active', 'ready', 'finish', true, 1, timezone('utc', now())),
  ('11111111-0000-4000-8000-000000000005', 'caleb@freeborn.local', 'Caleb', '1987-04-09', 'man', 'Asheville', 'North Carolina', 'US', 'Shepherd & homesteader',
   'Some things can''t be rushed — good soil, good bread, good love.',
   array['life_partner'], array['Environmental stewardship','Community'], array['Dogs','Hiking','Cooking'], array['Homesteading','Outdoorsy','Routine-oriented'],
   '[{"prompt":"The way to my heart…","answer":"Show up curious. Ask what the animals are saying, help bring in the hay, and stay for the long table dinner."}]'::jsonb,
   'active', 'ready', 'finish', false, 1, timezone('utc', now()))
on conflict (id) do nothing;

insert into public.profile_photos (user_id, storage_path, position, is_primary, width, height)
values
  ('11111111-0000-4000-8000-000000000001', 'https://images.pexels.com/photos/32045367/pexels-photo-32045367.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=1200&w=800', 0, true, 800, 1200),
  ('11111111-0000-4000-8000-000000000002', 'https://images.pexels.com/photos/5029926/pexels-photo-5029926.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=1200&w=800', 0, true, 800, 1200),
  ('11111111-0000-4000-8000-000000000003', 'https://images.pexels.com/photos/6893713/pexels-photo-6893713.png?auto=compress&cs=tinysrgb&fit=crop&h=1200&w=800', 0, true, 800, 1200),
  ('11111111-0000-4000-8000-000000000004', 'https://images.pexels.com/photos/6962984/pexels-photo-6962984.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=1200&w=800', 0, true, 800, 1200),
  ('11111111-0000-4000-8000-000000000005', 'https://images.pexels.com/photos/8826797/pexels-photo-8826797.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=1200&w=800', 0, true, 800, 1200)
on conflict (storage_path) do nothing;

insert into public.user_private_settings (user_id, last_active_at)
select id, timezone('utc', now()) from public.user_profiles where handle is distinct from 'preview_visitor'
on conflict (user_id) do nothing;

insert into public.notification_preferences (user_id)
select id from public.user_profiles where handle is distinct from 'preview_visitor'
on conflict (user_id) do nothing;

-- Second and third photos for each founding member (swipeable sets)
insert into public.profile_photos (user_id, storage_path, position, is_primary, width, height)
values
  ('11111111-0000-4000-8000-000000000001', 'https://images.pexels.com/photos/6798543/pexels-photo-6798543.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=1200&w=800', 1, false, 800, 1200),
  ('11111111-0000-4000-8000-000000000001', 'https://images.pexels.com/photos/31936486/pexels-photo-31936486.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=1200&w=800', 2, false, 800, 1200),
  ('11111111-0000-4000-8000-000000000002', 'https://images.pexels.com/photos/26747653/pexels-photo-26747653.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=1200&w=800', 1, false, 800, 1200),
  ('11111111-0000-4000-8000-000000000002', 'https://images.pexels.com/photos/5231083/pexels-photo-5231083.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=1200&w=800', 2, false, 800, 1200),
  ('11111111-0000-4000-8000-000000000003', 'https://images.pexels.com/photos/7034793/pexels-photo-7034793.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=1200&w=800', 1, false, 800, 1200),
  ('11111111-0000-4000-8000-000000000003', 'https://images.pexels.com/photos/7218988/pexels-photo-7218988.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=1200&w=800', 2, false, 800, 1200),
  ('11111111-0000-4000-8000-000000000004', 'https://images.pexels.com/photos/8330367/pexels-photo-8330367.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=1200&w=800', 1, false, 800, 1200),
  ('11111111-0000-4000-8000-000000000004', 'https://images.pexels.com/photos/8330264/pexels-photo-8330264.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=1200&w=800', 2, false, 800, 1200),
  ('11111111-0000-4000-8000-000000000005', 'https://images.pexels.com/photos/7728334/pexels-photo-7728334.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=1200&w=800', 1, false, 800, 1200),
  ('11111111-0000-4000-8000-000000000005', 'https://images.pexels.com/photos/7728079/pexels-photo-7728079.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=1200&w=800', 2, false, 800, 1200)
on conflict (storage_path) do nothing;

-- Vaccination stance + coordinates for distance filtering
update public.user_profiles set vaccination_status = case display_name
  when 'Mara' then 'unvaccinated' when 'Jonah' then 'unvaccinated'
  when 'Elena' then 'prefer_not_to_say' when 'Naomi' then 'unvaccinated'
  when 'Caleb' then 'vaccinated' else 'prefer_not_to_say' end
where display_name in ('Mara','Jonah','Elena','Naomi','Caleb');

insert into public.user_private_locations (user_id, latitude, longitude, source, city, region, country_code) values
  ('11111111-0000-4000-8000-000000000001', 30.2672, -97.7431, 'gps', 'Austin', 'Texas', 'US'),
  ('11111111-0000-4000-8000-000000000002', 43.6150, -116.2023, 'gps', 'Boise', 'Idaho', 'US'),
  ('11111111-0000-4000-8000-000000000003', 35.9251, -86.8689, 'gps', 'Franklin', 'Tennessee', 'US'),
  ('11111111-0000-4000-8000-000000000004', 45.5152, -122.6784, 'gps', 'Portland', 'Oregon', 'US'),
  ('11111111-0000-4000-8000-000000000005', 35.5951, -82.5515, 'gps', 'Asheville', 'North Carolina', 'US')
on conflict (user_id) do nothing;

-- Online status: seed some members as recently active, others offline
update public.user_profiles set last_active_at = timezone('utc', now()) where display_name in ('Mara','Jonah','Elena');
update public.user_profiles set last_active_at = timezone('utc', now()) - interval '3 days' where display_name in ('Naomi','Caleb');
