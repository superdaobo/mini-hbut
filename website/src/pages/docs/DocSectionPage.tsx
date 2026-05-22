type DocSection = {
    title: string;
    items: string[];
};

type DocSectionPageProps = {
    title: string;
    subtitle: string;
    audience: string;
    coverage: string[];
    sections: DocSection[];
};

const DocSectionPage = ({ title, subtitle, audience, coverage, sections }: DocSectionPageProps) => {
    return (
        <div className="space-y-10">
            <header className="space-y-4">
                <div className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan/80">{audience}</div>
                <h1 className="text-4xl font-bold bg-gradient-to-r from-cyan to-purple bg-clip-text text-transparent">
                    {title}
                </h1>
                <p className="text-lg leading-8 text-gray-300">{subtitle}</p>
            </header>

            <section className="rounded-lg border border-cyan/20 bg-cyan/5 p-5">
                <h2 className="mb-4 text-2xl font-bold text-white">覆盖范围</h2>
                <ul className="grid gap-3 md:grid-cols-2">
                    {coverage.map((item) => (
                        <li key={item} className="rounded-md border border-white/10 bg-white/5 px-4 py-3 text-gray-300">
                            {item}
                        </li>
                    ))}
                </ul>
            </section>

            <div className="space-y-6">
                {sections.map((section) => (
                    <section key={section.title} className="rounded-lg border border-white/10 bg-white/[0.03] p-5">
                        <h2 className="mb-4 text-2xl font-bold text-white">{section.title}</h2>
                        <ul className="space-y-3 text-gray-300">
                            {section.items.map((item) => (
                                <li key={item} className="leading-7">
                                    {item}
                                </li>
                            ))}
                        </ul>
                    </section>
                ))}
            </div>
        </div>
    );
};

export default DocSectionPage;
