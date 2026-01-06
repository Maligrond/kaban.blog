
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const bookmarks = [
    {
        title: "Солярис (роман) — Википедия",
        url: "https://ru.m.wikipedia.org/wiki/%D0%A1%D0%BE%D0%BB%D1%8F%D1%80%D0%B8%D1%81_(%D1%80%D0%BE%D0%BC%D0%B0%D0%BD)",
        date: "2025-04-14"
    },
    {
        title: "Книга: На темной стороне Луны. Боги, демоны, архетипы, от Персефоны до Азазеля - Олег Телемский. Купить книгу, читать рецензии | Лабиринт",
        url: "https://www.labirint.ru/books/658273/",
        date: "2025-04-13"
    },
    {
        title: "Земляноиды — Саяка Мурата | Литрес",
        url: "https://www.litres.ru/book/sayaka-murata-31607921/zemlyanoidy-68306158/",
        date: "2025-04-09"
    },
    {
        title: "Маска Агамемнона — Википедия",
        url: "https://ru.m.wikipedia.org/wiki/%D0%9C%D0%B0%D1%81%D0%BA%D0%B0_%D0%90%D0%B3%D0%B0%D0%BC%D0%B5%D0%BC%D0%BD%D0%BE%D0%BD%D0%B0",
        date: "2025-04-02"
    },
    {
        title: "Критские иероглифы — Википедия",
        url: "https://ru.m.wikipedia.org/wiki/%D0%9A%D1%80%D0%B8%D1%82%D1%81%D0%BA%D0%B8%D0%B5_%D0%B8%D0%B5%D1%80%D0%BE%D0%B3%D0%BB%D0%B8%D1%84%D1%8B",
        date: "2025-04-02"
    },
    {
        title: "Филистимский язык — Википедия",
        url: "https://ru.m.wikipedia.org/wiki/%D0%A4%D0%B8%D0%BB%D0%B8%D1%81%D1%82%D0%B8%D0%BC%D1%81%D0%BA%D0%B8%D0%B9_%D1%8F%D0%B7%D1%8B%D0%BA",
        date: "2025-04-02"
    },
    {
        title: "Пеласги — Википедия",
        url: "https://ru.m.wikipedia.org/wiki/%D0%9F%D0%B5%D0%BB%D0%B0%D1%81%D0%B3%D0%B8",
        date: "2025-04-02"
    },
    {
        title: "Илиада — Википедия",
        url: "https://ru.m.wikipedia.org/wiki/%D0%98%D0%BB%D0%B8%D0%B0%D0%B4%D0%B0",
        date: "2025-04-02"
    },
    {
        title: "Создаём ИИ-вайфу и не только: руководство по созданию виртуальных помощников — Вастрик.Клуб",
        url: "https://vas3k.club/post/27507/",
        date: "2025-04-02"
    },
    {
        title: "Вопрос: Загадка — как передать сообщение? Сериал Severance (Разделение) — Вастрик.Клуб",
        url: "https://vas3k.club/question/27595/",
        date: "2025-04-02"
    },
    {
        title: "Туринская плащаница — Википедия",
        url: "https://ru.m.wikipedia.org/wiki/%D0%A2%D1%83%D1%80%D0%B8%D0%BD%D1%81%D0%BA%D0%B0%D1%8F_%D0%BF%D0%BB%D0%B0%D1%89%D0%B0%D0%BD%D0%B8%D1%86%D0%B0",
        date: "2025-04-02"
    },
    {
        title: "Доклассический арабский язык — Википедия",
        url: "https://ru.m.wikipedia.org/wiki/%D0%94%D0%BE%D0%BA%D0%BB%D0%B0%D1%81%D1%81%D0%B8%D1%87%D0%B5%D1%81%D0%BA%D0%B8%D0%B9_%D0%B0%D1%80%D0%B0%D0%B1%D1%81%D0%BA%D0%B8%D0%B9_%D1%8F%D0%B7%D1%8B%D0%BA",
        date: "2025-04-02"
    },
    {
        title: "Ануннаки — Википедия",
        url: "https://ru.m.wikipedia.org/wiki/%D0%90%D0%BD%D1%83%D0%BD%D0%BD%D0%B0%D0%BA%D0%B8",
        date: "2025-04-02"
    },
    {
        title: "Фарисеи — Википедия",
        url: "https://ru.m.wikipedia.org/wiki/%D0%A4%D0%B0%D1%80%D0%B8%D1%81%D0%B5%D0%B8",
        date: "2025-04-02"
    },
    {
        title: "Иосиф Флавий — Википедия",
        url: "https://ru.m.wikipedia.org/wiki/%D0%98%D0%BE%D1%81%D0%B8%D1%84_%D0%A4%D0%BB%D0%B0%D0%B2%D0%B8%D0%B9",
        date: "2025-04-02"
    },
    {
        title: "Дильмун — Википедия",
        url: "https://ru.m.wikipedia.org/wiki/%D0%94%D0%B8%D0%BB%D1%8C%D0%BC%D1%83%D0%BD",
        date: "2025-04-02"
    },
    {
        title: "Тибетское Евангелие — Википедия",
        url: "https://ru.m.wikipedia.org/wiki/%D0%A2%D0%B8%D0%B1%D0%B5%D1%82%D1%81%D0%BA%D0%BE%D0%B5_%D0%95%D0%B2%D0%B0%D0%BD%D0%B3%D0%B5%D0%BB%D0%B8%D0%B5",
        date: "2025-04-02"
    },
    {
        title: "Дидахе — Википедия",
        url: "https://ru.m.wikipedia.org/wiki/%D0%94%D0%B8%D0%B4%D0%B0%D1%85%D0%B5",
        date: "2025-04-02"
    },
    {
        title: "Диалоги Платона — Википедия",
        url: "https://ru.m.wikipedia.org/wiki/%D0%94%D0%B8%D0%B0%D0%BB%D0%BE%D0%B3%D0%B8_%D0%9F%D0%BB%D0%B0%D1%82%D0%BE%D0%BD%D0%B0",
        date: "2025-04-02"
    },
    {
        title: "Мария Магдалина — Википедия",
        url: "https://ru.m.wikipedia.org/wiki/%D0%9C%D0%B0%D1%80%D0%B8%D1%8F_%D0%9C%D0%B0%D0%B3%D0%B4%D0%B0%D0%BB%D0%B8%D0%BD%D0%B0",
        date: "2025-04-02"
    },
    {
        title: "Исида — Википедия",
        url: "https://ru.m.wikipedia.org/wiki/%D0%98%D1%81%D0%B8%D0%B4%D0%B0",
        date: "2025-04-02"
    },
    {
        title: "Пополь-Вух — Википедия",
        url: "https://ru.m.wikipedia.org/wiki/%D0%9F%D0%BE%D0%BF%D0%BE%D0%BB%D1%8C-%D0%92%D1%83%D1%85",
        date: "2025-04-02"
    },
    {
        title: "Вопрос о происхождении древних египтян — Википедия",
        url: "https://ru.m.wikipedia.org/wiki/%D0%92%D0%BE%D0%BF%D1%80%D0%BE%D1%81_%D0%BE_%D0%BF%D1%80%D0%BE%D0%B8%D1%81%D1%85%D0%BE%D0%B6%D0%B4%D0%B5%D0%BD%D0%B8%D0%B8_%D0%B4%D1%80%D0%B5%D0%B2%D0%BD%D0%B8%D1%85_%D0%B5%D0%B3%D0%B8%D0%BF%D1%82%D1%8F%D0%BD",
        date: "2025-04-02"
    },
    {
        title: "Негритюд — Википедия",
        url: "https://ru.m.wikipedia.org/wiki/%D0%9D%D0%B5%D0%B3%D1%80%D0%B8%D1%82%D1%8E%D0%B4",
        date: "2025-04-02"
    },
    {
        title: "Афроцентризм — Википедия",
        url: "https://ru.m.wikipedia.org/wiki/%D0%90%D1%84%D1%80%D0%BE%D1%86%D0%B5%D0%BD%D1%82%D1%80%D0%B8%D0%B7%D0%BC",
        date: "2025-04-02"
    },
    {
        title: "Двадцатеричная система счисления — Википедия",
        url: "https://ru.m.wikipedia.org/wiki/%D0%94%D0%B2%D0%B0%D0%B4%D1%86%D0%B0%D1%82%D0%B5%D1%80%D0%B8%D1%87%D0%BD%D0%B0%D1%8F_%D1%81%D0%B8%D1%81%D1%82%D0%B5%D0%BC%D0%B0_%D1%81%D1%87%D0%B8%D1%81%D0%BB%D0%B5%D0%BD%D0%B8%D1%8F",
        date: "2025-04-02"
    },
    {
        title: "Тамоанчан — Википедия",
        url: "https://ru.m.wikipedia.org/wiki/%D0%A2%D0%B0%D0%BC%D0%BE%D0%B0%D0%BD%D1%87%D0%B0%D0%BD",
        date: "2025-04-02"
    },
    {
        title: "Платонизм — Википедия",
        url: "https://ru.m.wikipedia.org/wiki/%D0%9F%D0%BB%D0%B0%D1%82%D0%BE%D0%BD%D0%B8%D0%B7%D0%BC",
        date: "2025-04-02"
    },
    {
        title: "История (Геродот) — Википедия",
        url: "https://ru.m.wikipedia.org/wiki/%D0%98%D1%81%D1%82%D0%BE%D1%80%D0%B8%D1%8F_(%D0%93%D0%B5%D1%80%D0%BE%D0%B4%D0%BE%D1%82)",
        date: "2025-04-02"
    },
    {
        title: "Песнь песней Соломона — Википедия",
        url: "https://ru.m.wikipedia.org/wiki/%D0%9F%D0%B5%D1%81%D0%BD%D1%8C_%D0%BF%D0%B5%D1%81%D0%BD%D0%B5%D0%B9_%D0%A1%D0%BE%D0%BB%D0%BE%D0%BC%D0%BE%D0%BD%D0%B0",
        date: "2025-04-02"
    },
    {
        title: "Старояпонский язык — Википедия",
        url: "https://ru.m.wikipedia.org/wiki/%D0%A1%D1%82%D0%B0%D1%80%D0%BE%D1%8F%D0%BF%D0%BE%D0%BD%D1%81%D0%BA%D0%B8%D0%B9_%D1%8F%D0%B7%D1%8B%D0%BA",
        date: "2025-04-02"
    },
    {
        title: "Сумма технологии — Википедия",
        url: "https://ru.m.wikipedia.org/wiki/%D0%A1%D1%83%D0%BC%D0%BC%D0%B0_%D1%82%D0%B5%D1%85%D0%BD%D0%BE%D0%BB%D0%BE%D0%B3%D0%B8%D0%B8",
        date: "2025-04-02"
    },
    {
        title: "Иоанн Кронштадтский — Википедия",
        url: "https://ru.m.wikipedia.org/wiki/%D0%98%D0%BE%D0%B0%D0%BD%D0%BD_%D0%9A%D1%80%D0%BE%D0%BD%D1%88%D1%82%D0%B0%D0%B4%D1%82%D1%81%D0%BA%D0%B8%D0%B9",
        date: "2025-04-02"
    },
    {
        title: "Читать онлайн «Дневник Адама», Марк Твен – Литрес",
        url: "https://www.litres.ru/book/mark-twain/dnevnik-adama-162372/chitat-onlayn/",
        date: "2025-04-02"
    },
    {
        title: "Схоластика — Википедия",
        url: "https://ru.m.wikipedia.org/wiki/%D0%A1%D1%85%D0%BE%D0%BB%D0%B0%D1%81%D1%82%D0%B8%D0%BA%D0%B0",
        date: "2025-04-02"
    },
    {
        title: "Пресвитер Иоанн — Википедия",
        url: "https://ru.m.wikipedia.org/wiki/%D0%9F%D1%80%D0%B5%D1%81%D0%B2%D0%B8%D1%82%D0%B5%D1%80_%D0%98%D0%BE%D0%B0%D0%BD%D0%BD",
        date: "2025-04-02"
    },
    {
        title: "11 слов, помогающих понять культуру Сингапура • Arzamas",
        url: "https://arzamas.academy/mag/1303-singapur",
        date: "2025-04-02"
    },
    {
        title: "Сотворение Бога. Краткая история монотеизма — Юлия Латынина | Литрес",
        url: "https://www.litres.ru/book/uliya-latynina/sotvorenie-boga-kratkaya-istoriya-monoteizma-71596600/",
        date: "2025-04-02"
    },
    {
        title: "Хроники Акаши — Википедия",
        url: "https://ru.m.wikipedia.org/wiki/%D0%A5%D1%80%D0%BE%D0%BD%D0%B8%D0%BA%D0%B8_%D0%90%D0%BA%D0%B0%D1%88%D0%B8",
        date: "2025-04-02"
    },
    {
        title: "О чем рассказывают старые пленки, найденные в Костромской глуши?",
        url: "https://vlesah.com/people/o-chem-rasskazyvayut-starye-plenki-naydennye-v-kostromskoy-glushi",
        date: "2025-04-02"
    },
    {
        title: "🗿 Все, что нужно знать о здоровой коже лица",
        url: "https://blog.afadeev.com/skincare?cda=",
        date: "2025-04-02"
    },
    {
        title: "Подземка (книга) — Википедия",
        url: "https://ru.m.wikipedia.org/wiki/%D0%9F%D0%BE%D0%B4%D0%B7%D0%B5%D0%BC%D0%BA%D0%B0_(%D0%BA%D0%BD%D0%B8%D0%B3%D0%B0)",
        date: "2025-04-02"
    },
    {
        title: "Престолы — Википедия",
        url: "https://ru.m.wikipedia.org/wiki/%D0%9F%D1%80%D0%B5%D1%81%D1%82%D0%BE%D0%BB%D1%8B",
        date: "2025-04-02"
    },
    {
        title: "Езидизм — Википедия",
        url: "https://ru.m.wikipedia.org/wiki/%D0%95%D0%B7%D0%B8%D0%B4%D0%B8%D0%B7%D0%BC",
        date: "2025-04-02"
    },
    {
        title: "Сабеизм — Википедия",
        url: "https://ru.m.wikipedia.org/wiki/%D0%A1%D0%B0%D0%B1%D0%B5%D0%B8%D0%B7%D0%BC",
        date: "2025-04-02"
    },
    {
        title: "Мандейское письмо — Википедия",
        url: "https://ru.m.wikipedia.org/wiki/%D0%9C%D0%B0%D0%BD%D0%B4%D0%B5%D0%B9%D1%81%D0%BA%D0%BE%D0%B5_%D0%BF%D0%B8%D1%81%D1%8C%D0%BC%D0%BE",
        date: "2025-04-02"
    },
    {
        title: "Сабии — Википедия",
        url: "https://ru.m.wikipedia.org/wiki/%D0%A1%D0%B0%D0%B1%D0%B8%D0%B8",
        date: "2025-04-02"
    },
    {
        title: "Десять потерянных колен — Википедия",
        url: "https://ru.m.wikipedia.org/wiki/%D0%94%D0%B5%D1%81%D1%8F%D1%82%D1%8C_%D0%BF%D0%BE%D1%82%D0%B5%D1%80%D1%8F%D0%BD%D0%BD%D1%8B%D1%85_%D0%BA%D0%BE%D0%BB%D0%B5%D0%BD",
        date: "2025-04-02"
    },
    {
        title: "Геенна — Википедия",
        url: "https://ru.m.wikipedia.org/wiki/%D0%93%D0%B5%D0%B5%D0%BD%D0%BD%D0%B0",
        date: "2025-04-02"
    },
    {
        title: "Эдем — Википедия",
        url: "https://ru.m.wikipedia.org/wiki/%D0%AD%D0%B4%D0%B5%D0%BC",
        date: "2025-04-02"
    }
];

const targetDir = path.join(process.cwd(), 'src/content/bookmarks');

if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
}

// Generate the YAML content for items.md
let yamlContent = `---
items:
`;

bookmarks.forEach(bookmark => {
    // Escape quotes in title if necessary
    const title = bookmark.title.replace(/"/g, '\\"');

    yamlContent += `  - title: "${title}"
    url: "${bookmark.url}"
    description: ""
    date: "${bookmark.date}"
    tags: []
`;
});

yamlContent += `---\n`;

fs.writeFileSync(path.join(targetDir, 'items.md'), yamlContent);
console.log('Migration to single file complete!');
