import type { Metadata } from "next";
import Link from "next/link";

import SitePage from "@/components/SitePage";
import { CONTACT_URL, REPO_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Terms of use | Wirely",
  description: "The rules for using the hosted Wirely service at wirely.site.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <SitePage
      title="Terms of use"
      intro={
        <p>
          Last updated October 13, 2026. These terms cover the hosted service at{" "}
          <Link href="/">wirely.site</Link>. By signing in, you agree to them. The source code is
          a separate thing, licensed under the <a href={`${REPO_URL}/blob/main/LICENSE`}>MIT
          license</a>.
        </p>
      }
    >
      <h2>The service</h2>
      <p>
        Wirely is a free design canvas. It has no paid plans. It may change features, set limits,
        or shut down. If it shuts down, the maintainer will post notice on the site first so you can
        export your work.
      </p>

      <h2>Your account</h2>
      <p>
        Keep your sign in, agent tokens, and provider keys to yourself. You are responsible for
        what happens through them. Revoke a token in Settings if you think it leaked.
      </p>

      <h2>Your content</h2>
      <p>
        You own what you make in Wirely. You give Wirely permission to store, process, and show
        it only as far as needed to run the service for you, including showing it to people you
        share a review link with.
      </p>
      <p>
        You need the rights to what you upload or import. Do not import a site or an image you
        have no right to copy.
      </p>

      <h2>Acceptable use</h2>
      <p>Do not use Wirely to:</p>
      <ul>
        <li>Break the law, or host content that is illegal where you are.</li>
        <li>Build phishing pages, malware, or pages that impersonate another company.</li>
        <li>Harass people through review links or comments.</li>
        <li>
          Attack, overload, or probe the service, get around its limits, or reach other users&apos;
          data.
        </li>
      </ul>
      <p>Wirely may remove content or close an account that breaks these rules.</p>

      <h2>AI output and third parties</h2>
      <p>
        Pages are written by AI models. They can be wrong, look like existing work, or contain
        errors. Check them before you ship anything. When you use your own provider key or your
        own coding agent, that provider&apos;s terms and costs apply too.
      </p>

      <h2>No warranty</h2>
      <p>
        Wirely is provided as is, without warranties of any kind. Keep your own copy of work you
        cannot afford to lose.
      </p>

      <h2>Limit of liability</h2>
      <p>
        As far as the law allows, the maintainer is not liable for any indirect or consequential
        loss, or for lost data, profits, or work, that comes from using Wirely. Total liability
        for any claim is limited to what you paid for the service, which is nothing.
      </p>

      <h2>Changes</h2>
      <p>
        When these terms change, the date at the top changes too. If you keep using Wirely after
        a change, the new terms apply. The full history is in the{" "}
        <a href={REPO_URL}>public repository</a>.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about these terms go to the <a href={CONTACT_URL}>maintainer</a>. See also the{" "}
        <Link href="/privacy">privacy policy</Link>.
      </p>
    </SitePage>
  );
}
