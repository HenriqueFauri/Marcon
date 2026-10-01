import type { Metadata } from "next";
import { CONTATO_EMAIL, Documento, Secao } from "../documento";

export const metadata: Metadata = { title: "Política de privacidade" };

export default function PrivacidadePage() {
  return (
    <Documento titulo="Política de privacidade">
      <p>
        Aqui explicamos quais dados o Marcon guarda, para quê e quais são os seus direitos, conforme a Lei Geral de Proteção de
        Dados (LGPD, Lei 13.709/2018).
      </p>

      <Secao titulo="1. Quais dados tratamos">
        <ul className="flex list-disc flex-col gap-1.5 pl-5">
          <li>
            <strong>Da sua conta:</strong> nome, e-mail, nome do negócio e senha (guardada de forma criptografada). Se você entrar
            com o Google, recebemos nome e e-mail dessa conta.
          </li>
          <li>
            <strong>Do seu negócio:</strong> produtos, estoque, vendas, caixa, fornecedores e clientes que você cadastra, incluindo
            nome e telefone dos seus clientes.
          </li>
          <li>
            <strong>Da cobrança:</strong> CPF ou CNPJ, informado para a assinatura, e o estado dela. O número do cartão é digitado
            na página do Asaas e nunca passa pelo Marcon.
          </li>
          <li>
            <strong>Do aparelho:</strong> quando você ativa as notificações, o dado técnico necessário para enviar o aviso ao
            celular.
          </li>
        </ul>
      </Secao>

      <Secao titulo="2. Para que usamos">
        <p>
          Para fazer o Marcon funcionar (guardar e mostrar os seus dados), cobrar a assinatura, enviar os avisos que você ativou,
          dar suporte e proteger o serviço contra abuso. Não vendemos seus dados nem os usamos para publicidade.
        </p>
      </Secao>

      <Secao titulo="3. Você e os dados dos seus clientes">
        <p>
          Em relação aos dados dos seus clientes, você é quem decide o que cadastrar e para quê. O Marcon apenas guarda essas
          informações em seu nome. Cadastre só o necessário e respeite o direito dessas pessoas.
        </p>
      </Secao>

      <Secao titulo="4. Com quem compartilhamos">
        <p>Só com empresas que fazem o serviço funcionar, e apenas o necessário:</p>
        <ul className="flex list-disc flex-col gap-1.5 pl-5">
          <li>Supabase: banco de dados, login e armazenamento de fotos.</li>
          <li>Vercel: hospedagem do aplicativo.</li>
          <li>Google (Analytics) e Microsoft (Clarity): métricas de uso do site e do aplicativo.</li>
          <li>Asaas: cobrança da assinatura.</li>
        </ul>
        <p>Esses serviços podem processar dados em servidores fora do Brasil. Também compartilhamos dados se a lei ou uma ordem judicial exigir.</p>
      </Secao>

      <Secao titulo="5. Segurança e por quanto tempo guardamos">
        <p>
          Cada conta só acessa os próprios dados, com regras de acesso no próprio banco. Guardamos seus dados enquanto a conta
          existir. Depois que você pedir a exclusão, apagamos os dados, exceto o que formos obrigados a manter por lei (por exemplo,
          registros de cobrança).
        </p>
      </Secao>

      <Secao titulo="6. Seus direitos">
        <p>
          Você pode pedir a confirmação de que tratamos seus dados, uma cópia deles, a correção do que estiver errado, a exclusão da
          conta e dos dados, e retirar consentimentos. Escreva para{" "}
          <a className="text-brand-text underline" href={`mailto:${CONTATO_EMAIL}`}>{CONTATO_EMAIL}</a> e respondemos o quanto antes.
        </p>
      </Secao>

      <Secao titulo="7. Cookies">
        <p>
          Usamos cookies necessários para manter você conectado e lembrar o tema claro ou escuro. Também usamos o Google Analytics
          e o Microsoft Clarity para entender como o Marcon é usado (páginas visitadas, cliques, tempo de uso) e melhorar o produto.
          No aplicativo logado, o Clarity não registra o conteúdo da tela, como nomes, valores e telefones. Você pode bloquear esses
          cookies nas configurações do navegador. Não usamos cookies de
          publicidade.
        </p>
      </Secao>

      <Secao titulo="8. Mudanças">
        <p>Se esta política mudar de forma relevante, avisaremos no aplicativo ou por e-mail.</p>
      </Secao>
    </Documento>
  );
}
