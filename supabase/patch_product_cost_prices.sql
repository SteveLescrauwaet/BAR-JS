-- Mise à jour des prix d'achat / prix de revient moyens.
-- À exécuter une seule fois sur une base Supabase déjà initialisée.
-- Ne modifie ni les prix de vente, ni les stocks, ni les historiques.

with prices(name, category, cost_price) as (
  values
    ('Coca-Cola','Softs',0.64::numeric),
    ('Coca-Cola zéro','Softs',0.63::numeric),
    ('Fanta','Softs',0.64::numeric),
    ('Sprite','Softs',0.94::numeric),
    ('Fuze Tea pêche','Softs',1.07::numeric),
    ('Jus de fruit','Softs',0.85::numeric),
    ('Oasis','Softs',0.91::numeric),
    ('Aquarius','Softs',0.99::numeric),
    ('Eau plate','Softs',0.46::numeric),
    ('Eau pétillante','Softs',0.55::numeric),
    ('Jupiler','Bières',1.22::numeric),
    ('Stella','Bières',1.29::numeric),
    ('Jupiler Zéro','Bières',1.33::numeric),
    ('Carlsberg Zéro','Bières',1.40::numeric),
    ('Hoegaarden Rosée','Bières',1.25::numeric),
    ('Liefmans','Bières',1.40::numeric),
    ('Desperados','Bières',1.85::numeric),
    ('Paix Dieu','Bières spéciales',2.25::numeric),
    ('Orval','Bières spéciales',2.40::numeric),
    ('Duvel','Bières spéciales',1.65::numeric),
    ('Omer','Bières spéciales',1.75::numeric),
    ('Kasteel Rouge','Bières spéciales',1.55::numeric),
    ('Badou','Bières spéciales',2.08::numeric),
    ('Autres ...','Bières spéciales',1.75::numeric),
    ('Cava','Vins & apéritifs',1.35::numeric),
    ('Vin blanc','Vins & apéritifs',0.60::numeric),
    ('Vin rouge','Vins & apéritifs',0.60::numeric),
    ('Vin rosé','Vins & apéritifs',0.60::numeric),
    ('Porto','Vins & apéritifs',0.42::numeric),
    ('Martini rouge','Vins & apéritifs',0.60::numeric),
    ('Martini blanc','Vins & apéritifs',0.60::numeric),
    ('Café','Boissons chaudes',0.20::numeric),
    ('Thé','Boissons chaudes',0.12::numeric),
    ('Chocolat chaud','Boissons chaudes',0.58::numeric),
    ('Soupe','Boissons chaudes',0.59::numeric),
    ('Chips','Snacks',0.75::numeric),
    ('Croque','Snacks',1.20::numeric),
    ('Hamburger Mexicanos','Snacks',1.80::numeric),
    ('Hamburger','Snacks',1.35::numeric),
    ('Gaufre nature','Snacks',0.70::numeric),
    ('Gaufre Nutella','Snacks',0.95::numeric)
)
update public.products p
set cost_price = prices.cost_price
from prices
where lower(p.name) = lower(prices.name)
  and p.category = prices.category;

-- Contrôle rapide :
select name, category, sale_price, cost_price, (sale_price - cost_price) as unit_margin
from public.products
where active = true
order by category, sort_order, name;
