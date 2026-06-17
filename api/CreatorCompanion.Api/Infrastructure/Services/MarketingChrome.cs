using System.Net;
using System.Text;

namespace CreatorCompanion.Api.Infrastructure.Services;

/// <summary>
/// Shared marketing-site chrome (nav, footer, hamburger script, font links, GA4)
/// for server-rendered pages on the marketing domain. The blog renderer uses
/// this; the landing-page renderer keeps its own in-file copies (kept identical).
/// Styling for these elements comes from the marketing site's own styles.css
/// (linked in the head), so this is HTML only.
/// </summary>
public static class MarketingChrome
{
    public static string E(string? s) => WebUtility.HtmlEncode(s ?? string.Empty);

    public static void AppendHead(StringBuilder sb)
    {
        sb.Append("<meta charset=\"UTF-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">");
        sb.Append("<link rel=\"icon\" type=\"image/x-icon\" href=\"/favicon.ico\">");
        sb.Append("<link rel=\"preconnect\" href=\"https://fonts.googleapis.com\"><link rel=\"preconnect\" href=\"https://fonts.gstatic.com\" crossorigin>");
        sb.Append("<link href=\"https://fonts.googleapis.com/css2?family=Fraunces:wght@600;700;800;900&family=Plus+Jakarta+Sans:ital,wght@0,400;0,500;0,600;0,700;0,800;1,600;1,700&display=swap\" rel=\"stylesheet\">");
        sb.Append("<link rel=\"stylesheet\" href=\"/styles.css\">");
    }

    public static void AppendGa4(StringBuilder sb, string? ga4)
    {
        if (string.IsNullOrWhiteSpace(ga4)) return;
        var id = WebUtility.HtmlEncode(ga4);
        sb.Append($"<script async src=\"https://www.googletagmanager.com/gtag/js?id={id}\"></script>");
        sb.Append("<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','")
          .Append(id).Append("');</script>");
    }

    public static void AppendNav(StringBuilder sb) => sb.Append(NavHtml);
    public static void AppendFooter(StringBuilder sb) => sb.Append(FooterHtml);
    public static void AppendScripts(StringBuilder sb) => sb.Append(ScriptsHtml);

    private const string NavHtml = """
<nav class="nav nav--scrolled" id="nav"><div class="nav__inner"><a href="/" class="nav__logo"><img src="/logo-icon.png" alt="" class="nav__logo-icon"><span class="nav__logo-name">Creator Companion</span></a><div class="nav__links"><a href="/blog">Blog</a><a href="/#pricing">Pricing</a><a href="/#faq-home">FAQ</a><a href="https://app.creatorcompanionapp.com/login">Log in</a><a href="/signup.html" class="btn btn--primary btn--sm">Start free trial</a></div><button class="nav__hamburger" id="hamburger" aria-label="Open menu"><span></span><span></span><span></span></button></div></nav>
<div class="mobile-menu" id="mobileMenu"><a href="/blog">Blog</a><a href="/#pricing">Pricing</a><a href="/#faq-home">FAQ</a><a href="https://app.creatorcompanionapp.com/login">Log in</a><a href="/signup.html" class="btn btn--primary btn--sm">Start free trial</a></div>
""";

    private const string FooterHtml = """
<footer class="site-footer"><div class="container"><div class="site-footer__top"><a href="/" class="site-footer__logo"><img src="/logo-icon.png" alt="" class="site-footer__logo-icon"><span class="site-footer__logo-name">Creator Companion</span></a><nav class="site-footer__nav"><a href="/blog">Blog</a><a href="/#pricing">Pricing</a><a href="/#faq-home">FAQ</a><a href="/signup.html">Sign up</a><a href="https://app.creatorcompanionapp.com/login">Log in</a><a href="/privacy.html">Privacy</a><a href="/terms.html">Terms</a></nav></div><div class="site-footer__bottom"><span>© 2026 Creator Companion. All rights reserved.</span><div class="site-footer__socials"><a class="site-footer__social" href="https://bsky.app/profile/creatorcompanion.bsky.social" target="_blank" rel="noopener noreferrer" aria-label="Creator Companion on Bluesky"><svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor" aria-hidden="true"><path d="M12 10.8c-1.087-2.114-4.046-6.053-6.798-7.995C2.566.944 1.561 1.266.902 1.565.139 1.908 0 3.08 0 3.768c0 .69.378 5.65.624 6.479.815 2.736 3.713 3.66 6.383 3.364.136-.02.275-.039.415-.056-.138.022-.276.04-.415.056-3.912.58-7.387 2.005-2.83 7.078 5.013 5.19 6.87-1.113 7.823-4.308.953 3.195 2.05 9.271 7.733 4.308 4.267-4.308 1.172-6.498-2.74-7.078a8.741 8.741 0 0 1-.415-.056c.14.017.279.036.415.056 2.67.296 5.568-.628 6.383-3.364.246-.828.624-5.79.624-6.478 0-.69-.139-1.861-.902-2.206-.659-.298-1.664-.62-4.3 1.24C16.046 4.748 13.087 8.687 12 10.8Z"/></svg></a><a class="site-footer__social" href="https://mastodon.social/@creatorcompanion" target="_blank" rel="noopener noreferrer me" aria-label="Creator Companion on Mastodon"><svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor" aria-hidden="true"><path d="M23.268 5.313c-.35-2.578-2.617-4.61-5.304-5.004C17.51.242 15.792 0 11.813 0h-.03c-3.98 0-4.835.242-5.288.309C3.882.692 1.496 2.518.917 5.127.64 6.412.61 7.837.661 9.143c.074 1.874.088 3.745.26 5.611.118 1.24.325 2.47.62 3.68.55 2.237 2.777 4.098 4.96 4.857 2.336.792 4.849.923 7.256.38.265-.061.527-.132.786-.213.585-.184 1.27-.39 1.774-.753a.057.057 0 0 0 .023-.043v-1.809a.052.052 0 0 0-.02-.041.053.053 0 0 0-.046-.01 20.282 20.282 0 0 1-4.709.545c-2.73 0-3.463-1.284-3.674-1.818a5.593 5.593 0 0 1-.319-1.433.053.053 0 0 1 .066-.054c1.517.363 3.072.546 4.632.546.376 0 .75 0 1.125-.01 1.57-.044 3.224-.124 4.768-.422.038-.008.077-.015.11-.024 2.435-.464 4.753-1.92 4.989-5.604.008-.145.03-1.52.03-1.67.002-.512.167-3.63-.024-5.545zm-3.748 9.195h-2.561V8.29c0-1.309-.55-1.976-1.67-1.976-1.23 0-1.846.79-1.846 2.35v3.403h-2.546V8.663c0-1.56-.617-2.35-1.848-2.35-1.112 0-1.668.668-1.67 1.977v6.218H4.822V8.102c0-1.31.337-2.35 1.011-3.12.696-.77 1.608-1.164 2.74-1.164 1.311 0 2.302.5 2.962 1.498l.638 1.06.638-1.06c.66-.999 1.65-1.498 2.96-1.498 1.13 0 2.043.395 2.74 1.164.675.77 1.012 1.81 1.012 3.12z"/></svg></a><a class="site-footer__social" href="https://substack.com/@creatorcompanion" target="_blank" rel="noopener noreferrer" aria-label="Creator Companion on Substack"><svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor" aria-hidden="true"><path d="M22.539 8.242H1.46V5.406h21.08v2.836zM1.46 10.812V24L12 18.11 22.54 24V10.812H1.46zM22.54 0H1.46v2.836h21.08V0z"/></svg></a></div></div></div></footer>
""";

    private const string ScriptsHtml = """
<script>
const hamburger=document.getElementById('hamburger'),menu=document.getElementById('mobileMenu');
if(hamburger&&menu){hamburger.addEventListener('click',()=>{hamburger.classList.toggle('open');menu.classList.toggle('open');});menu.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>{hamburger.classList.remove('open');menu.classList.remove('open');}));}
var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.add('is-in');io.unobserve(e.target);}});},{threshold:0.12,rootMargin:'0px 0px -40px 0px'});
document.querySelectorAll('.reveal').forEach(function(el){io.observe(el);});
</script>
""";
}
