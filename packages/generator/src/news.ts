import { readFileSync } from "fs";
import { join } from "path";
import type { Article, ZipConfig } from "./schema.ts";
import { NewsSnapshotSchema } from "./schema.ts";

export interface NewsProvider {
  fetch(config: ZipConfig): Promise<Article[]>;
}

export function filterByValidCategories(
  articles: Article[],
  categories: string[]
): Article[] {
  const validSet = new Set(categories);
  return articles.filter((a) => validSet.has(a.category));
}

const MOCK_ARTICLES: Record<string, Article[]> = {
  "20854": [
    {
      headline: "Montgomery County Approves $3.8B Budget with Record School Funding",
      summary:
        "The Montgomery County Council unanimously approved a $3.8 billion operating budget that increases education funding by 7% and adds 200 new teacher positions across the county.",
      affects_you:
        "Potomac-area schools will receive additional staff and resources. Property taxes will increase by approximately $180/year for the median homeowner.",
      category: "Taxes & Budget",
      level: "local",
      source: "MoCo360",
      url: "https://moco360.media/budget-2025",
      author: "Sarah Kim",
      published: "2026-06-12",
    },
    {
      headline: "Potomac Recreation Center Renovation Plans Unveiled",
      summary:
        "The Potomac Community Recreation Center Board presented plans for a $12M renovation including a new aquatic center, expanded fitness facilities, and accessible parking.",
      affects_you:
        "Construction begins in September and will temporarily close the indoor pool for 8 months. Resident membership fees will not increase during construction.",
      category: "Housing",
      level: "local",
      source: "Bethesda Magazine",
      url: "https://bethesdamagazine.com/potomac-rec-renovation",
      author: "James Park",
      published: "2026-06-11",
    },
    {
      headline: "New Traffic Signal Timing on River Road to Reduce Congestion",
      summary:
        "Montgomery County DOT will implement adaptive signal timing along River Road corridor from Falls Road to Seven Locks Road, aimed at reducing peak-hour delays by 25%.",
      affects_you:
        "Morning commuters on River Road should see shorter waits at intersections starting July 1. The system uses AI to adjust signal timing in real time.",
      category: "Transportation & Infrastructure",
      level: "local",
      source: "MoCo360",
      url: "https://moco360.media/river-road-signals",
      author: null,
      published: "2026-06-10",
    },
    {
      headline: "Maryland General Assembly Passes Climate Solutions Act",
      summary:
        "The Maryland legislature passed sweeping climate legislation requiring 100% clean electricity by 2035 and establishing a $500M clean energy transition fund for affected workers.",
      affects_you:
        "Maryland utility customers will see electricity rates rise 4-6% over 5 years, but may qualify for rebates on heat pumps and EV chargers under the new law.",
      category: "Environment",
      level: "state",
      source: "Maryland Matters",
      url: "https://marylandmatters.org/climate-solutions-act",
      author: "Elena Rodriguez",
      published: "2026-06-12",
    },
    {
      headline: "Maryland Expands Medicaid Dental Coverage to Adults",
      summary:
        "Governor Moore signed legislation extending comprehensive dental coverage to all adult Medicaid enrollees, adding approximately 400,000 Marylanders to dental benefits.",
      affects_you:
        "If you or a family member has Medicaid, dental care including cleanings, fillings, and dentures are now covered with no additional premium.",
      category: "Health",
      level: "state",
      source: "The Baltimore Banner",
      url: "https://www.thebaltimorebanner.com/medicaid-dental",
      author: "Marcus Johnson",
      published: "2026-06-11",
    },
    {
      headline: "Maryland DOT Announces I-270 Express Lane Extension to Frederick",
      summary:
        "The Maryland Department of Transportation approved the final phase of I-270 Express Lanes, extending managed lanes 25 miles north to Frederick with construction starting in 2027.",
      affects_you:
        "Commuters from Potomac using I-270 will have express lane access to Frederick. Toll rates will vary by congestion; current Montgomery segment tolls average $4-12 per trip.",
      category: "Transportation & Infrastructure",
      level: "state",
      source: "Maryland Matters",
      url: "https://marylandmatters.org/i270-express-lanes",
      author: "David Chen",
      published: "2026-06-10",
    },
    {
      headline: "Congress Passes Federal Infrastructure Resilience Act",
      summary:
        "The bipartisan Infrastructure Resilience Act allocates $180B over 10 years for hardening roads, bridges, and utilities against extreme weather events, with formula grants to states.",
      affects_you:
        "Maryland is projected to receive $2.1B, with Montgomery County eligible for competitive grants to upgrade aging stormwater systems and flood-prone roads.",
      category: "Transportation & Infrastructure",
      level: "national",
      source: "NPR",
      url: "https://www.npr.org/infrastructure-resilience-act",
      author: "Claire Williams",
      published: "2026-06-12",
    },
    {
      headline: "FTC Finalizes Rules on Junk Fees for Housing and Services",
      summary:
        "The Federal Trade Commission issued final rules requiring upfront disclosure of all mandatory fees in rental listings, hotel bookings, and subscription services.",
      affects_you:
        "Rental listings in Potomac must now show total monthly cost including mandatory fees. Violations carry fines up to $50,000 per listing.",
      category: "Housing",
      level: "national",
      source: "AP News",
      url: "https://apnews.com/ftc-junk-fees-rule",
      author: "Robert Martinez",
      published: "2026-06-11",
    },
    {
      headline: "CDC Updates Childhood Vaccine Schedule for 2026",
      summary:
        "The Centers for Disease Control updated the recommended childhood immunization schedule, adding RSV vaccine for infants and modifying flu vaccine timing recommendations.",
      affects_you:
        "Parents of infants born after June 1 should ask their pediatrician about the new RSV immunization. All schedule changes take effect September 1, 2026.",
      category: "Health",
      level: "national",
      source: "PBS NewsHour",
      url: "https://www.pbs.org/newshour/cdc-vaccine-schedule-2026",
      author: null,
      published: "2026-06-10",
    },
  ],
  _default: [
    {
      headline: "Local Government Budget Season Underway",
      summary: "Municipal governments across the region are finalizing budgets for the upcoming fiscal year.",
      affects_you: "Property tax rates and local service levels will be determined by these budget decisions.",
      category: "Taxes & Budget",
      level: "local",
      source: "Local News",
      author: null,
      published: "2026-06-12",
    },
    {
      headline: "State Legislature in Session",
      summary: "The state legislature is considering several bills affecting residents statewide.",
      affects_you: "New laws may affect your taxes, healthcare, and infrastructure.",
      category: "Elections & Government",
      level: "state",
      source: "State News",
      author: null,
      published: "2026-06-12",
    },
    {
      headline: "Congress Debates Federal Spending Package",
      summary: "Federal lawmakers are negotiating a comprehensive spending package for the coming fiscal year.",
      affects_you: "Federal funding levels affect local school grants, road projects, and social services in your area.",
      category: "Taxes & Budget",
      level: "national",
      source: "NPR",
      author: null,
      published: "2026-06-12",
    },
  ],
};

export class MockProvider implements NewsProvider {
  async fetch(config: ZipConfig): Promise<Article[]> {
    const zipArticles = MOCK_ARTICLES[config.zip];
    if (zipArticles) return zipArticles;
    return MOCK_ARTICLES["_default"] ?? [];
  }
}

export class ClaudeProvider implements NewsProvider {
  async fetch(_config: ZipConfig): Promise<Article[]> {
    throw new Error(
      "ClaudeProvider is not yet implemented. Use --provider mock for Phase 1."
    );
  }
}

const NEWS_DIR = join(import.meta.dir, "..", "registry", "news");

// Reads a committed news snapshot for the ZIP (registry/news/<zip>.json).
// Snapshots are generated out-of-band (Claude Code + web search) so the build
// itself stays free of live API calls.
export class SnapshotProvider implements NewsProvider {
  async fetch(config: ZipConfig): Promise<Article[]> {
    const file = join(NEWS_DIR, `${config.zip}.json`);
    let raw: string;
    try {
      raw = readFileSync(file, "utf-8");
    } catch {
      throw new Error(
        `No news snapshot for ZIP ${config.zip} (expected registry/news/${config.zip}.json). ` +
          `Generate one, or build with --provider mock.`
      );
    }
    const snapshot = NewsSnapshotSchema.parse(JSON.parse(raw));
    return snapshot.articles;
  }
}
