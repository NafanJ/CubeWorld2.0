
with grid as (
  select * from (values
    ('Garden Nook',0,0),('Workshop',1,0),('Square',2,0),
    ('Library',0,1),('Studio',1,1),('Porch',2,1)
  ) v(name,x,y)
)
insert into rooms(name,x,y) select name,x,y from grid;

insert into agents(name,provider,model,room_id,persona,mood,energy) values
 ('Mellie','openai','gpt-4o-mini',(select id from rooms where name='Garden Nook'),'{"traits":["shy","gardener"]}',1,5),
 ('Pip','anthropic','claude-3-haiku',(select id from rooms where name='Workshop'),'{"traits":["curious","polite"]}',0,5),
 ('Kiki','cohere','command-r',(select id from rooms where name='Square'),'{"traits":["bold","chatty"]}',2,5),
 ('Odo','openai','gpt-4.1-mini',(select id from rooms where name='Library'),'{"traits":["observant","calm"]}',0,4),
 ('Rook','anthropic','claude-3-5-sonnet',(select id from rooms where name='Studio'),'{"traits":["builder","organiser"]}',1,5),
 ('Luma','mistral','mistral-small-latest',(select id from rooms where name='Porch'),'{"traits":["painter","poet"]}',1,5);
