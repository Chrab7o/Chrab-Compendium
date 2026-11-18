-- The Dictionary: a public glossary of world lore (terms, what they mean,
-- how they connect). Anyone can read it; anyone signed in can add or edit a
-- term, and only a DM can delete one. Seeded from the original lore
-- spreadsheet. Run via `npx supabase db push`.

create table if not exists dictionary_terms (
  id uuid primary key default gen_random_uuid(),
  world_id uuid references worlds(id) on delete cascade,
  term text not null check (length(trim(term)) > 0),
  definition text,
  category text,
  -- Comma-separated term names, as in the spreadsheet; the page links each
  -- one that matches another term.
  related_to text,
  examples text,
  additional_info text,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists dictionary_terms_world_term_idx
  on dictionary_terms (world_id, lower(term));

create or replace function set_dictionary_term_editor()
returns trigger as $$
begin
  new.updated_at = now();
  new.updated_by = auth.uid();
  return new;
end;
$$ language plpgsql;

drop trigger if exists dictionary_terms_set_editor on dictionary_terms;
create trigger dictionary_terms_set_editor
  before update on dictionary_terms
  for each row execute function set_dictionary_term_editor();

alter table dictionary_terms enable row level security;

drop policy if exists "dictionary is publicly readable" on dictionary_terms;
create policy "dictionary is publicly readable"
  on dictionary_terms for select
  using (true);

drop policy if exists "signed-in users add terms" on dictionary_terms;
create policy "signed-in users add terms"
  on dictionary_terms for insert
  with check (auth.uid() is not null);

drop policy if exists "signed-in users edit terms" on dictionary_terms;
create policy "signed-in users edit terms"
  on dictionary_terms for update
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

drop policy if exists "dm deletes terms" on dictionary_terms;
create policy "dm deletes terms"
  on dictionary_terms for delete
  using (is_dm());

-- Seed: every term belongs to Alva.
insert into dictionary_terms (world_id, term, definition, category, related_to, examples, additional_info)
select (select id from worlds where lower(trim(name)) = 'alva' limit 1), v.*
from (values
  ('Alva', 'The universe which all events of the Chrab TTRPG take place.', 'Locations', 'Old World, New World', 'Equivalent of our universe', null),
  ('Channeling', 'The process of manipulating certain phenomena of the world that are malleable through the use of actions, words, and other means. Requires will and attunement to perform.', 'Rules, Laws, Principles and Phenomena', 'Cultivation', null, null),
  ('Cores', 'Fundamental concepts and principles of both the Old and New world that governs all beings.', 'Rules, Laws, Principles and Phenomena', null, 'Gravity, the need to eat', null),
  ('Cultivation', 'The process by which a person can strengthen their attunement to Galdur.', 'Rules, Laws, Principles and Phenomena', 'Channeling', 'Bards Cultivate through musical expression, so for a spell like vicious mockery a description might go as follows ‘You speak some words of harm towards the target, and will the words to feel like piercing needles as they echo into their ears.’', null),
  ('Galdur', 'A form of malleable energy that composes all living things in Alva, allowing for the manipulation of reality according to the user''s command and strength of will.', 'Materials and Energies', 'Alva', null, null),
  ('Sicaron', null, 'Material', null, null, null),
  ('Solium', null, 'Material', null, null, null),
  ('Realms', 'Dimensions that overlap with Gaia that house specific elements and creatures. Accessible through spaces known as The Inbetween, which connect with other Realms and Gaia.', 'Locations', 'Alva', 'Thunder, Frozen, Infernal, Spirit, Cursed, Heavenly', null),
  ('Deity', 'The manifested ideals of their followers. They must be believed in by their followers, else they would cease to exist. Additionally, the more followers a deity has, the more power they wield and influence they have in their own representative category.', 'Persons and Beings', 'Realms', 'Followers of the Moon Goddess believe in her as the representative of the Moon and provides blessings in relation to the moon', null),
  ('New World', 'The universe after Galdur had entered, which had generated life that was void from the Old World.', 'Locations', 'Old World', null, null),
  ('Old World', 'The universe before Galdur had entered, which was decimated due to an unknown event, which created a lifeless universe full of despair.', 'Locations', 'New World', null, null),
  ('Gaia', 'A planet that contains the continent of Calypso.', 'Locations', 'Calypso', 'Equivalent of Earth', null),
  ('Calypso', 'A massive continent on the planet of Gaia. 2480 miles long and 2460 miles wide.', 'Locations', 'Gaia', 'Equivalent of North America', null),
  ('In Between Lands', 'The place where two realms collide, whether it is two realms or Gaia and another realm. It is highly dangerous, but also where high level channeling can occur. Known to host large scale disasters and high concentrations of Galdur.', 'Locations', 'Realms, Gaia', null, null),
  ('Padia', 'A desert city run by the Sahdis in the Northwestern part of the Calypsian Desert region. Features jagged rocks acting as barriers for the city.', 'Locations', 'Calypso', 'Equivalent of the Wild West', null),
  ('Sahdis', 'A shadow collective group of individuals that form a counsel, who are the defacto rulers of Padia. They are presumed to be replaced about every decade and chosen by their predecessors .', 'Persons and Beings', 'Padia', null, null),
  ('Eldvindar', 'Extremely hot winds exclusive to the Calypsian Desert, which are most potent between 11am and 3pm, which will affect anyone after 10 minutes after exposure.', 'Rules, Laws, Principles and Phenomena', 'Calypso', 'Burn through the skin like a knife between 11 and 3', null),
  ('Kard', 'A port city located in the Southwestern tip of the Calypsian peninsula. Run by a city counsel, it serves as the primary trade center/port for Calypso.', 'Locations', 'Calypso', 'Equivalent of Miami', 'Mainly serves fish and is used for tourism and mercantile business, including the "Merchants Strip", a city long strip where stalls and vendors are lined. The city is also host to plenty of organzed crime and gambling.'),
  ('The Gamblers Causeway', 'Section of Kard hosting games and services where anything goes, including casting and cheating.', 'Locations', 'Kard', null, null),
  ('Calhoun', 'A city bordering Lake Calix, also known as the "Cursed City". Rumors of hautings are spread about this city, along with constant water damage from the lake, creating incessant creaking noises.', 'Locations', 'Lake Calix', null, null),
  ('Xares', 'A city that borders Lake Xares. Known as the "City of Innovation". The city is run by governer Bacillus Cavaren and his council of 20 elected city members. Expensive cost of living which is offset by the free amenities. Every new invention produced in the city is given as a free gift to all home owning residents, boosting the cities reputation. Divided into three provinces, themed after what the city has invested into.', 'Locations', 'Lake Xares, Nahvale', null, 'Provinces:
- province dedicated to Galdurian Crystals, torches replaced with crystals, shops sell gems
- province dedicated to Metallurgy, streets are made of bronze and walls are lined with alloys designed to be resistant and long lasting
- province dedicated to Hydraulics. While lacking compared to the other two provinces, during certain times, civillians can hop into tubes and be transported throughout the province through water pressure.'),
  ('Akren', 'An island to the direct South of the Calypsian continent. Known as a prison which comes in the form of a massive fortress, the only known safe way in or out of the fortress is through a teleportation circle that changes its combination every day.', 'Locations', null, 'Equivalent of Guantanamo Bay', null),
  ('Bore', 'A city state in the Eastern Region of Calypso, on the Northeast side of Lake Ven, it is a monarchy ruled by Yenla, a non-binary monarch.', 'Locations', 'Lake Ven', null, 'Yenla and the king before them were one of the Heroes of Talmundre''s biggest supporters and as such is a safe haven should they need it.'),
  ('Nahvale', 'A city state near the Center of the continent, next to the Swamp of Seven Echos and named after Henry Hvale, originally it was a harsh swamp that was transformed by a group of channelers into a more hospitable place.', 'Locations', 'Xares', null, 'Created a pact with Xares where the latter would send a large Galdur crystal to assist in the purification of the swamp waters and the former would send the solid residue from the swamp over to Xares for research. The less aggressive local wildlife have since been domesticated.'),
  ('Geuford', 'A city built on the edge of the Umbral Veil and located near the Western region, it is a hub for exploration on Calypso. It is governed by Tuvalli Geuford VII, a very wealthy family who gained their fortune of finding relics within the Veil.', 'Locations', 'Umbral Veil, Hanging Corridor', null, 'A section that covers half of the city, known as the Hanging Corridor, is built to hang over the Veil, creating business advertising trips and guides into the Veil. Those who buy one of the few 500 or so homes in the Hanging Corridor usually will attach rope ladders from hatches underneath their floors to easily descend into the veil. Those who buy these homes usually don’t have families, so every few months, the city ordinance will conduct a search on the home, and if the find that the home has been vacant for seven months, they will presume the owner dead, and sell the home to the next person on the ever growing list of applicants.'),
  ('Longwood', 'A city state built deep within the Kolora forest, to the Southwestern region, it is bound by a pact to reject all metal. All things are made of either wood or galdur enchanted flora. The state is run by the Triumvirate: Faetra Pableteble, Jorjin longbraid, and Selqaryn Fiddlebrand.', 'Locations', 'Kolora Tree', null, 'The triumvirate is a group of arch druid gnomes who govern the land according to the will of nature and, more extensively, the Kolora Tree.'),
  ('Kolora Forest', 'The forest resides in the Southwestern region of Calypso. Deep within the Kolora forest lies its namesake tree along with the city of Longwood.', 'Locations', 'Kolora Tree', null, 'The forest is dense with Galdur; which has caused many mutations within the flora and wildlife that reside there. The forest is regarded as a dangerous place to those who stray from the roads which have been warded from some of the more harsh naturally occurring phenomena.'),
  ('Kolora Tree', 'It is said that the Kolora tree was the first plant to be planted by the founders when the world was coming to be. It is also believed by most druids that the soul of a founder lives in the tree, and because of the tree''s connection to jörð, the tree''s wisdom is prophetic and in tune with the very core of all nature.', 'Locations', 'Kolora Forest, Longwood', null, 'It is unsure if the knowledge mentioned is true for the only people capable of talking to the tree are the triumvirate many others have tried but none others have succeeded'),
  ('Jetrich Mountain Range', 'This mountain range, located around the center of Calypso, spans from the western coast of Calypso all the way to Mount Lumen. The range consists of very jagged peaks and steep inclines.', 'Locations', 'Mount Lumen', null, 'There is no officially maintained road over the mountains, but there is an old road which has long since been abandoned. During the day, very little happens on the range, but at night when the paths are next to impossible to see, the few who choose to travel the mountains by nightfall say they''ve seen figures standing at impossible angles illuminated only by moonlight.'),
  ('Agatha', 'A city state built on the Jetrich Mountain Range. Nicknamed the ‘Ceaseless Wind’ for the seemingly constant stream of fresh breeze that flows from west to east through the city. The city is home to very basic wind power that is used to rotate a set of wheels that fan air into a large furnace in the center of the city keeping a constant blaze that can then be used for warmth, or light.', 'Locations', 'Jetrich Mountain Range, Second Wind Abbey, Second Wind Monks', null, 'Due to its location it is often regarded as a place of rest for the travelers brave enough to cross over the mountain range instead of choosing to go around it. The state of Agatha is very peaceful as the trek to the territory is too lucrative for people who wish to do evil. Due to the wind, all homes in the city are designed to have their front doors facing north and their western windows designed with a specialized multi-layered hatch to control the amount of wind that is being let in at once. In a way this system acts like its own thermostat allowing dwellers to control how cool the house gets. Surrounding the city are a few very small villages, and perhaps more importantly the Second Wind Abbey, a monastery responsible for the Second Wind monks who can often be seen leaping effortlessly from mountain top to mountain top across the range.'),
  ('Dalmekia', 'A city located just north of Mount Lumen, partially buit into the cliff side. It is the only theocratic city state. It''s inhabitants are worshipers of Yenara, godess of love.', 'Locations', 'Yenara, Mount Lumen', null, 'The cities water supply is provided directly from the mountain flowing down directly through a waterfall into the city and travels along waterways through every street and neighborhood pooling into a basin that can be used as a well. Additionally this water is infused by the galdur from the mountain and provides minor relief from ailments for a short while.'),
  ('Mount Lumen', 'A massive mountain, it is known as Calypso''s most notable landmark for its sheer size. Due to an incident with Ragnatha, the original mountain was surrounded by equally large mountains, forming the structure seen today. Currently, it is seperated into two parts: the Terrarium and Revelation.', 'Locations', 'Ragnatha, Terrarium, Revelation', null, 'When the mountain was created by the founders it was much smaller. It was one mountain with one peak until it was taken over by one Ragnatha, a dragon who choose to roost on the mountain and start a nest.'),
  ('Terrarium', 'An underground network of caves that chain all the different cliffs of Mount Lumen together.', 'Locations', 'Mount Lumen', null, 'It is within these complex set of tunnels that the Terra Dragons reside.'),
  ('Revelation', 'A lake at the top of Mount Lumen. It has garnered that tile over the centuries for the many prophetic visions that have taken place there.', 'Locations', 'Mount Lumen', null, 'It is the one place on Calypso that has an abundance of Neutral Galdur; as such, many orcales travel to the lake as a form of pilgrimage to receive visions. These visions come with great risk. The waters of the lake will cause permanent alterations to channelers who step into the pool without proper intent. Even the oracles who practice their entire childhood to receive a prophecy often find themselves changed by the water.'),
  ('Frosthold', 'It is the Northernmost city on Calypso. located in a portion of the continent known as Mölbrotin.', 'Locations', 'Mölbrotin', null, 'It lost 40% of its land in the Battle of Froln, and instead of building more city to replace it, has set up a perimeter that surrounds the water on its west side and created a safe haven for boat houses.'),
  ('Mölbrotin', 'A series of islands off the coast that were once one landmass shattered and split in the battle of Froln (Froln being a smaller city that no longer exists).', 'Locations', 'Frosthold', null, null),
  ('Vleuburn', 'Known as "The Crystal City", it is located on the West side of Calypso and was built around the portal to the Frozen Realm. Vleuburn is the epicenter of Galdur studies on Calypso. There are many institutions dedicated to the teaching and studying of Galdur of all types in the city.', 'Locations', 'Frozen Realm', null, 'The concentration of Galdur emanating from the portal allowed the settlers of the city to easly command pillars of crystallized Galdur that was used to build a lavish city full of magic.'),
  ('Illebridge', 'A city in the Eastern Region, located in the crater of Karsus, it was destroyed and rebuilt thrice over due to disputes between powerful terramancers.', 'Locations', 'Karsus', null, 'Illebridge is built in the shape of a massive pot. With the entrance being at the top. The city makes use of a very complex pulley system to manage a variety of lifts that run on a timer known as Stóra.')
) as v(term, definition, category, related_to, examples, additional_info)
where not exists (
  select 1 from dictionary_terms d where lower(d.term) = lower(v.term)
);
