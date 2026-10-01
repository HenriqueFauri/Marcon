import Script from "next/script";

// Google Analytics 4 e Microsoft Clarity. Cada um só carrega se o id estiver definido:
//   NEXT_PUBLIC_GA_ID        id de métricas do GA4 (G-XXXXXXXXXX)
//   NEXT_PUBLIC_CLARITY_ID   id do projeto no Clarity
// O Clarity grava a tela do usuário, então o conteúdo do app logado é mascarado
// (data-clarity-mask no layout de (app), cobrindo menu e telas): ele vê cliques e navegação, não nomes nem valores.
const GA_ID = /^G-[A-Z0-9]+$/;
const CLARITY_ID = /^[a-z0-9]+$/;

export function Analytics() {
  const ga = process.env.NEXT_PUBLIC_GA_ID;
  const clarity = process.env.NEXT_PUBLIC_CLARITY_ID;

  return (
    <>
      {ga && GA_ID.test(ga) && (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${ga}`} strategy="afterInteractive" />
          <Script id="ga-init" strategy="afterInteractive">
            {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','${ga}');`}
          </Script>
        </>
      )}
      {clarity && CLARITY_ID.test(clarity) && (
        <Script id="clarity-init" strategy="afterInteractive">
          {`(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);})(window,document,"clarity","script","${clarity}");`}
        </Script>
      )}
    </>
  );
}
