import type { Metadata } from "next";
import { PLANOS, DIAS_DE_TESTE, PLANO_GRATIS } from "@/lib/planos";
import { formatBRL } from "@/lib/format";
import { CONTATO_EMAIL, Documento, Secao } from "../documento";

export const metadata: Metadata = { title: "Termos de uso" };

export default function TermosPage() {
  return (
    <Documento titulo="Termos de uso">
      <p>
        Estes termos valem para quem cria uma conta no Marcon, um sistema online de gestão de vendas, estoque e caixa para pequenos
        negócios. Ao criar a conta, você concorda com eles.
      </p>

      <Secao titulo="1. A sua conta">
        <p>
          Você é responsável pelo acesso à sua conta e por tudo o que acontece nela. Informe dados verdadeiros, guarde sua senha e
          avise a gente se suspeitar de uso indevido. Cada conta é de uma pessoa ou de um negócio.
        </p>
      </Secao>

      <Secao titulo="2. Planos e cobrança">
        <p>
          Os primeiros {DIAS_DE_TESTE} dias são de teste gratuito, com tudo liberado e sem cartão. Depois do teste, você pode
          continuar no plano grátis (até {PLANO_GRATIS.limites.vendasPorMes} vendas por mês e {PLANO_GRATIS.limites.produtos}{" "}
          produtos) ou assinar o plano {PLANOS.marcon.nome}, por {formatBRL(PLANOS.marcon.valor)} por mês, sem limites.
        </p>
        <p>
          A assinatura é cobrada todo mês no cartão de crédito, por meio do Asaas. O Marcon não vê nem guarda o número do seu
          cartão. Você pode cancelar quando quiser, na tela Assinatura: nenhuma nova cobrança será feita e você volta ao plano
          grátis. Valores já pagos não são devolvidos pelo período em andamento, salvo quando a lei exigir.
        </p>
        <p>Podemos alterar os preços e planos, avisando com antecedência. Quem já assina mantém o valor até o aviso valer.</p>
      </Secao>

      <Secao titulo="3. Seus dados">
        <p>
          Os dados que você cadastra (produtos, vendas, clientes, fornecedores, caixa) são seus. Cada conta só enxerga os próprios
          dados. Você é responsável por ter o direito de cadastrar as informações dos seus clientes e por tratá-las conforme a lei.
          Detalhes em nossa Política de privacidade.
        </p>
        <p>
          Seus dados continuam guardados se você cancelar a assinatura. Se quiser que sejam apagados, é só pedir pelo e-mail abaixo.
        </p>
      </Secao>

      <Secao titulo="4. Uso aceitável">
        <p>
          Não use o Marcon para atividades ilegais, para tentar acessar dados de outras contas, para sobrecarregar o serviço ou para
          enviar conteúdo que viole direitos de terceiros. Podemos suspender ou bloquear contas que descumpram isso.
        </p>
      </Secao>

      <Secao titulo="5. Disponibilidade e responsabilidade">
        <p>
          Trabalhamos para o Marcon funcionar o tempo todo, mas não garantimos que não haverá interrupções ou erros. Os cálculos de
          lucro, caixa e estoque dependem do que você registra: confira os números antes de tomar decisões importantes. O Marcon não
          substitui contador nem emite nota fiscal. Na extensão permitida em lei, nossa responsabilidade se limita ao valor que você
          pagou nos últimos 12 meses.
        </p>
      </Secao>

      <Secao titulo="6. Mudanças">
        <p>
          Podemos atualizar estes termos. Quando a mudança for relevante, avisaremos no aplicativo ou por e-mail. Continuar usando o
          Marcon depois do aviso significa que você aceita a nova versão.
        </p>
      </Secao>

      <Secao titulo="7. Contato">
        <p>
          Dúvidas, pedidos ou problemas: <a className="text-brand-text underline" href={`mailto:${CONTATO_EMAIL}`}>{CONTATO_EMAIL}</a>.
          Estes termos seguem as leis do Brasil.
        </p>
      </Secao>
    </Documento>
  );
}
