-- Dados de exemplo para uma conta de demonstração (apresentação a influenciadores e clientes).
-- Troque o e-mail abaixo e rode no SQL Editor do Supabase (ou pelo MCP). A conta precisa já existir.
-- Cria produtos, clientes, vendas dos últimos 25 dias e alguns gastos, pelas mesmas funções
-- da importação do app. Datas são relativas a hoje, então a conta sempre parece em uso.
-- Rodar duas vezes não duplica produtos nem vendas (ficam ignorados). Só use em conta de demonstração.

do $$
declare
  v_email constant text := 'COLOQUE_O_EMAIL_DA_CONTA_DEMO';
  v_uid uuid;
  v_hoje date := hoje_br();
begin
  select id into v_uid from auth.users where lower(email) = lower(v_email);
  if v_uid is null then raise exception 'Conta % não encontrada. Crie a conta antes.', v_email; end if;

  -- as funções de importação usam auth.uid(): aqui ele passa a ser a conta demo
  perform set_config('request.jwt.claim.sub', v_uid::text, true);

  perform importar_produtos(jsonb_build_array(
    jsonb_build_object('nome', 'Fone Bluetooth KZ', 'categoria', 'Eletrônicos', 'custo', 38, 'preco_varejo', 89.9, 'estoque', 14),
    jsonb_build_object('nome', 'Carregador Turbo 20W', 'categoria', 'Eletrônicos', 'custo', 14, 'preco_varejo', 39.9, 'estoque', 22),
    jsonb_build_object('nome', 'Cabo USB-C 1m Reforçado', 'categoria', 'Acessórios', 'custo', 4.5, 'preco_varejo', 19.9, 'estoque', 40),
    jsonb_build_object('nome', 'Capinha Antichoque iPhone 13', 'categoria', 'Acessórios', 'custo', 6, 'preco_varejo', 29.9, 'estoque', 18),
    jsonb_build_object('nome', 'Mini Ventilador Portátil', 'categoria', 'Casa', 'custo', 11, 'preco_varejo', 34.9, 'estoque', 9),
    jsonb_build_object('nome', 'Luminária LED de Mesa', 'categoria', 'Casa', 'custo', 19, 'preco_varejo', 59.9, 'estoque', 7),
    jsonb_build_object('nome', 'Smartwatch D20', 'categoria', 'Eletrônicos', 'custo', 32, 'preco_varejo', 79.9, 'estoque', 11),
    jsonb_build_object('nome', 'Caixa de Som Bluetooth', 'categoria', 'Eletrônicos', 'custo', 41, 'preco_varejo', 109.9, 'estoque', 5),
    jsonb_build_object('nome', 'Suporte Veicular para Celular', 'categoria', 'Acessórios', 'custo', 8, 'preco_varejo', 27.9, 'estoque', 2),
    jsonb_build_object('nome', 'Garrafa Térmica 500ml', 'categoria', 'Casa', 'custo', 17, 'preco_varejo', 49.9, 'estoque', 12)
  ));

  perform importar_vendas(jsonb_build_array(
    jsonb_build_object('ref', 'demo-01', 'data', v_hoje - 24, 'cliente_nome', 'Marcos Silva', 'canal', 'Marketplace', 'forma_pagamento', 'PIX', 'total', 89.9, 'custo_total', 38,
      'itens', jsonb_build_array(jsonb_build_object('nome', 'Fone Bluetooth KZ', 'quantidade', 1, 'preco_unitario', 89.9, 'custo_unitario', 38))),
    jsonb_build_object('ref', 'demo-02', 'data', v_hoje - 23, 'cliente_nome', 'Camila Rocha', 'canal', 'Instagram', 'forma_pagamento', 'PIX', 'total', 59.8, 'custo_total', 18.5,
      'itens', jsonb_build_array(jsonb_build_object('nome', 'Carregador Turbo 20W', 'quantidade', 1, 'preco_unitario', 39.9, 'custo_unitario', 14), jsonb_build_object('nome', 'Cabo USB-C 1m Reforçado', 'quantidade', 1, 'preco_unitario', 19.9, 'custo_unitario', 4.5))),
    jsonb_build_object('ref', 'demo-03', 'data', v_hoje - 21, 'cliente_nome', 'João Pereira', 'canal', 'Marketplace', 'forma_pagamento', 'Dinheiro', 'total', 79.9, 'custo_total', 32,
      'itens', jsonb_build_array(jsonb_build_object('nome', 'Smartwatch D20', 'quantidade', 1, 'preco_unitario', 79.9, 'custo_unitario', 32))),
    jsonb_build_object('ref', 'demo-04', 'data', v_hoje - 19, 'cliente_nome', 'Fernanda Lima', 'canal', 'WhatsApp', 'forma_pagamento', 'PIX', 'total', 109.9, 'custo_total', 41,
      'itens', jsonb_build_array(jsonb_build_object('nome', 'Caixa de Som Bluetooth', 'quantidade', 1, 'preco_unitario', 109.9, 'custo_unitario', 41))),
    jsonb_build_object('ref', 'demo-05', 'data', v_hoje - 17, 'cliente_nome', 'Rafael Costa', 'canal', 'Marketplace', 'forma_pagamento', 'PIX', 'total', 57.8, 'custo_total', 14,
      'itens', jsonb_build_array(jsonb_build_object('nome', 'Capinha Antichoque iPhone 13', 'quantidade', 1, 'preco_unitario', 29.9, 'custo_unitario', 6), jsonb_build_object('nome', 'Suporte Veicular para Celular', 'quantidade', 1, 'preco_unitario', 27.9, 'custo_unitario', 8))),
    jsonb_build_object('ref', 'demo-06', 'data', v_hoje - 15, 'cliente_nome', 'Marcos Silva', 'canal', 'WhatsApp', 'forma_pagamento', 'PIX', 'total', 34.9, 'custo_total', 11,
      'itens', jsonb_build_array(jsonb_build_object('nome', 'Mini Ventilador Portátil', 'quantidade', 1, 'preco_unitario', 34.9, 'custo_unitario', 11))),
    jsonb_build_object('ref', 'demo-07', 'data', v_hoje - 13, 'cliente_nome', 'Patrícia Souza', 'canal', 'Instagram', 'forma_pagamento', 'Cartão', 'total', 119.8, 'custo_total', 40.5,
      'itens', jsonb_build_array(jsonb_build_object('nome', 'Luminária LED de Mesa', 'quantidade', 1, 'preco_unitario', 59.9, 'custo_unitario', 19), jsonb_build_object('nome', 'Garrafa Térmica 500ml', 'quantidade', 1, 'preco_unitario', 49.9, 'custo_unitario', 17), jsonb_build_object('nome', 'Cabo USB-C 1m Reforçado', 'quantidade', 1, 'preco_unitario', 10, 'custo_unitario', 4.5))),
    jsonb_build_object('ref', 'demo-08', 'data', v_hoje - 11, 'cliente_nome', 'Lucas Andrade', 'canal', 'Marketplace', 'forma_pagamento', 'PIX', 'total', 89.9, 'custo_total', 38,
      'itens', jsonb_build_array(jsonb_build_object('nome', 'Fone Bluetooth KZ', 'quantidade', 1, 'preco_unitario', 89.9, 'custo_unitario', 38))),
    jsonb_build_object('ref', 'demo-09', 'data', v_hoje - 9, 'cliente_nome', 'Camila Rocha', 'canal', 'Instagram', 'forma_pagamento', 'PIX', 'total', 79.8, 'custo_total', 28,
      'itens', jsonb_build_array(jsonb_build_object('nome', 'Carregador Turbo 20W', 'quantidade', 2, 'preco_unitario', 39.9, 'custo_unitario', 14))),
    jsonb_build_object('ref', 'demo-10', 'data', v_hoje - 7, 'cliente_nome', 'Bruno Martins', 'canal', 'Marketplace', 'forma_pagamento', 'Dinheiro', 'total', 79.9, 'custo_total', 32,
      'itens', jsonb_build_array(jsonb_build_object('nome', 'Smartwatch D20', 'quantidade', 1, 'preco_unitario', 79.9, 'custo_unitario', 32))),
    jsonb_build_object('ref', 'demo-11', 'data', v_hoje - 5, 'cliente_nome', 'Fernanda Lima', 'canal', 'WhatsApp', 'forma_pagamento', 'PIX', 'total', 49.9, 'custo_total', 17,
      'itens', jsonb_build_array(jsonb_build_object('nome', 'Garrafa Térmica 500ml', 'quantidade', 1, 'preco_unitario', 49.9, 'custo_unitario', 17))),
    jsonb_build_object('ref', 'demo-12', 'data', v_hoje - 3, 'cliente_nome', 'Rafael Costa', 'canal', 'Marketplace', 'forma_pagamento', 'PIX', 'total', 139.7, 'custo_total', 48.5,
      'itens', jsonb_build_array(jsonb_build_object('nome', 'Fone Bluetooth KZ', 'quantidade', 1, 'preco_unitario', 89.9, 'custo_unitario', 38), jsonb_build_object('nome', 'Cabo USB-C 1m Reforçado', 'quantidade', 1, 'preco_unitario', 19.9, 'custo_unitario', 4.5), jsonb_build_object('nome', 'Capinha Antichoque iPhone 13', 'quantidade', 1, 'preco_unitario', 29.9, 'custo_unitario', 6))),
    jsonb_build_object('ref', 'demo-13', 'data', v_hoje - 1, 'cliente_nome', 'Patrícia Souza', 'canal', 'Instagram', 'forma_pagamento', 'Cartão', 'total', 109.9, 'custo_total', 41,
      'itens', jsonb_build_array(jsonb_build_object('nome', 'Caixa de Som Bluetooth', 'quantidade', 1, 'preco_unitario', 109.9, 'custo_unitario', 41))),
    jsonb_build_object('ref', 'demo-14', 'data', v_hoje, 'cliente_nome', 'Lucas Andrade', 'canal', 'WhatsApp', 'forma_pagamento', 'PIX', 'total', 27.9, 'custo_total', 8,
      'itens', jsonb_build_array(jsonb_build_object('nome', 'Suporte Veicular para Celular', 'quantidade', 1, 'preco_unitario', 27.9, 'custo_unitario', 8)))
  ));

  perform importar_lancamentos(jsonb_build_array(
    jsonb_build_object('ref', 'demo-g1', 'tipo', 'saida', 'origem', 'gasto', 'categoria', 'Frete', 'descricao', 'Fretes e embalagens', 'valor', 62.4, 'data', v_hoje - 20),
    jsonb_build_object('ref', 'demo-g2', 'tipo', 'saida', 'origem', 'gasto', 'categoria', 'Embalagem', 'descricao', 'Caixas e fita adesiva', 'valor', 38, 'data', v_hoje - 12),
    jsonb_build_object('ref', 'demo-g3', 'tipo', 'saida', 'origem', 'gasto', 'categoria', 'Frete', 'descricao', 'Envio de pedidos da semana', 'valor', 47.5, 'data', v_hoje - 4)
  ));
end;
$$;
