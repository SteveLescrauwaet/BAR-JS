-- Initial categories and products.
-- Safe to run more than once: existing categories/products are left untouched.

insert into public.categories(name,sort_order) values
('Softs',10),
('Bières',20),
('Bières spéciales',30),
('Vins & apéritifs',40),
('Boissons chaudes',50),
('Snacks',60)
on conflict (name) do nothing;

insert into public.products(name,category,sale_price,cost_price,stock,starting_stock,stock_tracked,sort_order,active)
select * from (values
('Coca-Cola','Softs',2.50,0.64,20,20,true,10,true),
('Coca-Cola zéro','Softs',2.50,0.63,20,20,true,20,true),
('Fanta','Softs',2.50,0.64,20,20,true,30,true),
('Sprite','Softs',2.50,0.94,20,20,true,40,true),
('Fuze Tea pêche','Softs',2.50,1.07,20,20,true,50,true),
('Jus de fruit','Softs',2.50,0.85,20,20,true,60,true),
('Oasis','Softs',2.50,0.91,20,20,true,70,true),
('Aquarius','Softs',3.00,0.99,20,20,true,80,true),
('Eau plate','Softs',2.00,0.46,20,20,true,90,true),
('Eau pétillante','Softs',2.00,0.55,20,20,true,100,true),

('Jupiler','Bières',2.50,1.22,20,20,true,10,true),
('Stella','Bières',2.50,1.29,20,20,true,20,true),
('Jupiler Zéro','Bières',2.50,1.33,20,20,true,30,true),
('Carlsberg Zéro','Bières',2.50,1.40,20,20,true,40,true),
('Hoegaarden Rosée','Bières',2.50,1.25,20,20,true,50,true),
('Liefmans','Bières',2.50,1.40,20,20,true,60,true),
('Desperados','Bières',3.50,1.85,20,20,true,70,true),

('Paix Dieu','Bières spéciales',4.50,2.25,20,20,true,10,true),
('Orval','Bières spéciales',4.50,2.40,20,20,true,20,true),
('Duvel','Bières spéciales',4.50,1.65,20,20,true,30,true),
('Omer','Bières spéciales',4.50,1.75,20,20,true,40,true),
('Kasteel Rouge','Bières spéciales',4.50,1.55,20,20,true,50,true),
('Badou','Bières spéciales',4.50,2.08,20,20,true,60,true),
('Autres ...','Bières spéciales',4.50,1.75,20,20,true,70,true),

('Cava','Vins & apéritifs',3.50,1.35,20,20,true,10,true),
('Vin blanc','Vins & apéritifs',3.00,0.60,20,20,true,20,true),
('Vin rouge','Vins & apéritifs',3.00,0.60,20,20,true,30,true),
('Vin rosé','Vins & apéritifs',3.00,0.60,20,20,true,40,true),
('Porto','Vins & apéritifs',3.50,0.42,20,20,true,50,true),
('Martini rouge','Vins & apéritifs',3.50,0.60,20,20,true,60,true),
('Martini blanc','Vins & apéritifs',3.50,0.60,20,20,true,70,true),

('Café','Boissons chaudes',2.00,0.20,20,20,true,10,true),
('Thé','Boissons chaudes',2.00,0.12,20,20,true,20,true),
('Chocolat chaud','Boissons chaudes',2.00,0.58,20,20,true,30,true),
('Soupe','Boissons chaudes',2.00,0.59,20,20,true,40,true),

('Chips','Snacks',2.00,0.75,20,20,true,10,true),
('Croque','Snacks',3.00,1.20,20,20,true,20,true),
('Hamburger Mexicanos','Snacks',4.00,1.80,20,20,true,30,true),
('Hamburger','Snacks',3.00,1.35,20,20,true,40,true),
('Gaufre nature','Snacks',3.00,0.70,20,20,true,50,true),
('Gaufre Nutella','Snacks',3.50,0.95,20,20,true,60,true)
) as v(name,category,sale_price,cost_price,stock,starting_stock,stock_tracked,sort_order,active)
where not exists (
  select 1 from public.products p where lower(p.name)=lower(v.name) and p.category=v.category
);
