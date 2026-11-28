# Referência: como o ZapVoice organiza o painel (pesquisa de 27/11/2026)

Pedido do dono depois de testar o build 0.3.2: entender o fluxo do ZapVoice (extensão do WhatsApp Web, cerca de 50 mil usuários na Chrome Web Store) para criar, editar e apagar mensagens, áudios, mídias e funis dentro da própria extensão. Só análise, com palavras nossas: nada de texto, imagem ou código deles. Nome, textos, visual e código continuam sendo do Marcon.

## Fontes e limite do que dá para saber

- Página da extensão na Chrome Web Store, páginas de venda (zapvoice.com, zapvoice.com.br, app.zapvoice.com) e vídeos públicos de tutorial no YouTube (inclusive o resumo por capítulos de um deles).
- Não há central de ajuda pública: o "suporte" é um link direto para conversa no WhatsApp, e as aulas ficam numa área de membros paga. As capturas da loja não têm descrição. Por isso o detalhe fino (confirmação ao apagar, ordem manual, tela de conta) **não aparece em nenhuma fonte pública**; onde a análise abaixo diz "não mostrado", é isso.
- Não instalamos a extensão deles (pede chave paga e roda funções internas do WhatsApp).

## O fluxo deles, em resumo

1. **Ativação por chave.** Depois da compra, chega por e-mail uma chave única que o usuário cola no painel. Uso da mesma chave em dois lugares bloqueia a conta. Não há login com e-mail e senha.
2. **Painel ao lado do WhatsApp Web**, aberto pelo ícone fixado na barra do navegador.
3. **Uma seção por tipo de conteúdo:** Mensagens (texto), Áudios, Mídias (foto, vídeo, arquivo) e Funis. Cada seção é uma lista de itens com nome.
4. **Criar é sempre o mesmo gesto:** botão de item novo dentro da seção, dar um nome curto ("saudação", "print de vendas") e preencher. Texto: digita ou cola e salva. Mídia: arrasta o arquivo para dentro da ferramenta. Áudio: sobe um arquivo já gravado e dá um nome a ele (gravar dentro da extensão não aparece nas fontes).
5. **Usar é um clique no nome do item**, com a conversa aberta. O áudio sai como mensagem de voz, e eles simulam "gravando..." antes de mandar.
6. **Funil:** botão de funil novo, dar um nome, adicionar itens (áudio, texto, mídia) em ordem, com um intervalo entre um e outro (o exemplo dos vídeos usa 60 segundos). Disparado, o funil corre sozinho; a recomendação é não fechar o WhatsApp até acabar.
7. **Editar, reordenar e apagar:** não mostrado nas fontes públicas.
8. **Conta e plano:** ficam fora da extensão (e-mail da compra, área de membros, plataforma de pagamento). Dentro do painel, só a chave.
9. **Automação** (agendar mensagem, funil com tempo, gatilho por palavra, disparo em massa): é o centro da venda deles.

## O que vale para o Marcon

| Ideia deles | Como fica no Marcon |
| --- | --- |
| Uma seção por tipo, lista de itens com nome | Já temos (Respostas, Mídia, sequências no topo de Respostas). Agora cada lista ganha a linha **Nova resposta**, **Nova sequência** e o botão **Adicionar arquivo** no próprio painel |
| Criar = item novo, nome curto, conteúdo | Editor curto no próprio painel: nome em cima, conteúdo embaixo, **Salvar** e **Cancelar**. Volta para a lista com "‹ Respostas" na cor da marca, como o "‹ Anterior" do app |
| Arquivo entra arrastando ou escolhendo | **Adicionar arquivo** abre o seletor do computador (foto, PDF, áudio), com os mesmos tipos e limites do app; foto é reduzida antes de subir, como no app |
| Áudio com nome | Já gravamos no painel e pedimos o nome antes de salvar; agora também dá para subir áudio do computador e renomear depois |
| Funil = nome + itens em ordem | Sequência = nome + passos em ordem; cada passo tem texto (escrito ou de uma resposta pronta) e/ou um arquivo, editável e reordenável no painel |
| Usar = um clique no item | Mantido: cada clique faz uma coisa só |
| Editar e apagar não ficam claros | Fizemos explícito: **Editar** em cada item, **Apagar** no fim do editor, sempre com pergunta de confirmação ("Apagar ...? Sai do app e da extensão.") |
| Ordem não aparece | **Organizar** liga setas de subir e descer, as mesmas do app |
| Conta e plano fora do painel | No Marcon a conta é do app: o topo do painel abre um menu com o e-mail, Seu plano, Claro e Escuro e Sair, num lugar só |

## O que fica de fora, pela regra do dono

- Funil que anda sozinho com intervalo, agendamento, gatilho por palavra, resposta automática e disparo em massa. No Marcon todo envio é um clique do dono, e a sequência só aponta o próximo passo.
- Simular "gravando..." antes do áudio. O áudio de voz sai na hora do clique de confirmação, sem fingir nada.
- Ativação por chave paga e bloqueio por uso simultâneo. No Marcon a conta é a mesma do app, com e-mail e senha ou Google.
