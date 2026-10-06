import fs from "node:fs";
import path from "node:path";

// Mapping of specific folder names to their real vehicle specs
const SPECIFIC_VEHICLES = {
  "fvrg86": {
    brand: "Toyota",
    model: "Urban Cruiser",
    version: "1.3 Dual VVT-i 4x2",
    year: 2014,
    price: 6990000,
    km: 125000,
    fuel: "Bencina",
    transmission: "Manual",
    bodyType: "SUV",
    engine: "1.3L Dual VVT-i",
    power: "99 HP",
    traction: "4x2",
    doors: 5,
    owners: 1,
    featured: true,
    frontImage: "/cars/inventory/fvrg86/0.jpg"
  },
  "fhvc10": {
    brand: "Hyundai",
    model: "Tucson",
    version: "2.0 GL 4x2",
    year: 2017,
    price: 13490000,
    km: 98000,
    fuel: "Bencina",
    transmission: "Manual",
    bodyType: "SUV",
    engine: "2.0L MPI",
    power: "155 HP",
    traction: "4x2",
    doors: 5,
    owners: 1,
    featured: true,
    frontImage: "/cars/inventory/fhvc10/0.jpg"
  },
  "cvff32": {
    brand: "Nissan",
    model: "Terrano",
    version: "2.5 TDI DX Doble Cabina 4x4",
    year: 2017,
    price: 10990000,
    km: 160000,
    fuel: "Diésel",
    transmission: "Manual",
    bodyType: "Pickup",
    engine: "2.5L Turbo Diésel",
    power: "133 HP",
    traction: "4x4",
    doors: 4,
    owners: 1,
    featured: true,
    frontImage: "/cars/inventory/cvff32/0.jpg"
  },
  "dxtz99": {
    brand: "Nissan",
    model: "Terrano",
    version: "2.5 TDI DX Doble Cabina 4x4",
    year: 2018,
    price: 11490000,
    km: 145000,
    fuel: "Diésel",
    transmission: "Manual",
    bodyType: "Pickup",
    engine: "2.5L Turbo Diésel",
    power: "133 HP",
    traction: "4x4",
    doors: 4,
    owners: 1,
    featured: true,
    frontImage: "/cars/inventory/dxtz99/0.jpg"
  },
  "gwpf76": {
    brand: "Chevrolet",
    model: "D-Max",
    version: "2.5 TD Doble Cabina 4x4",
    year: 2018,
    price: 12990000,
    km: 135000,
    fuel: "Diésel",
    transmission: "Manual",
    bodyType: "Pickup",
    engine: "2.5L Turbo Diésel",
    power: "136 HP",
    traction: "4x4",
    doors: 4,
    owners: 1,
    featured: true,
    frontImage: "/cars/inventory/gwpf76/0.jpg"
  },
  "hjcw79": {
    brand: "Subaru",
    model: "Outback",
    version: "2.5i AWD Dynamic",
    year: 2017,
    price: 14490000,
    km: 112000,
    fuel: "Bencina",
    transmission: "Automática",
    bodyType: "Station Wagon",
    engine: "2.5L Boxer",
    power: "175 HP",
    traction: "AWD",
    doors: 5,
    owners: 1,
    featured: true,
    frontImage: "/cars/inventory/hjcw79/0.jpg"
  },
  "jddy77": {
    brand: "Mitsubishi",
    model: "L200",
    version: "2.4 DI-D Katana 4x4",
    year: 2018,
    price: 13990000,
    km: 128000,
    fuel: "Diésel",
    transmission: "Manual",
    bodyType: "Pickup",
    engine: "2.4L MIVEC Turbo Diésel",
    power: "152 HP",
    traction: "4x4",
    doors: 4,
    owners: 1,
    featured: true,
    frontImage: "/cars/inventory/jddy77/0.jpg"
  },
  "jgrf99": {
    brand: "Mitsubishi",
    model: "L200",
    version: "2.4 DI-D Katana 4x4",
    year: 2018,
    price: 13990000,
    km: 130000,
    fuel: "Diésel",
    transmission: "Manual",
    bodyType: "Pickup",
    engine: "2.4L MIVEC Turbo Diésel",
    power: "152 HP",
    traction: "4x4",
    doors: 4,
    owners: 1,
    featured: true,
    frontImage: "/cars/inventory/jgrf99/0.jpg"
  },
  "jspb25": {
    brand: "Peugeot",
    model: "2008",
    version: "1.6 BlueHDi Allure",
    year: 2018,
    price: 11490000,
    km: 88000,
    fuel: "Diésel",
    transmission: "Manual",
    bodyType: "SUV",
    engine: "1.6L BlueHDi",
    power: "100 HP",
    traction: "4x2",
    doors: 5,
    owners: 1,
    featured: true,
    frontImage: "/cars/inventory/jspb25/0.jpg"
  },
  "jzkb82": {
    brand: "Fiat",
    model: "Fiorino",
    version: "1.4 Fire City",
    year: 2018,
    price: 6990000,
    km: 95000,
    fuel: "Bencina",
    transmission: "Manual",
    bodyType: "Furgón",
    engine: "1.4L Fire",
    power: "85 HP",
    traction: "4x2",
    doors: 3,
    owners: 1,
    featured: false,
    frontImage: "/cars/inventory/jzkb82/0.jpg"
  },
  "jzwg23": {
    brand: "Maxus",
    model: "T60",
    version: "2.8 TD DX 4x4 Doble Cabina",
    year: 2019,
    price: 12490000,
    km: 110000,
    fuel: "Diésel",
    transmission: "Manual",
    bodyType: "Pickup",
    engine: "2.8L VGT Turbo Diésel",
    power: "148 HP",
    traction: "4x4",
    doors: 4,
    owners: 1,
    featured: true,
    frontImage: "/cars/inventory/jzwg23/4.jpg"
  },
  "lpbr18": {
    brand: "Toyota",
    model: "Hilux",
    version: "2.4 DX 4x4 Doble Cabina",
    year: 2020,
    price: 18990000,
    km: 115000,
    fuel: "Diésel",
    transmission: "Manual",
    bodyType: "Pickup",
    engine: "2.4L Turbo Diésel",
    power: "150 HP",
    traction: "4x4",
    doors: 4,
    owners: 1,
    featured: true,
    frontImage: "/cars/inventory/lpbr18/0.jpg"
  },
  "ilux2017": {
    brand: "Toyota",
    model: "Hilux",
    version: "2.4 DX 4x4 Doble Cabina",
    year: 2021,
    price: 21990000,
    km: 131000,
    fuel: "Diésel",
    transmission: "Manual",
    bodyType: "Pickup",
    engine: "2.4L Turbo Diésel",
    power: "150 HP",
    traction: "4x4",
    doors: 4,
    owners: 1,
    featured: true,
    frontImage: "/cars/inventory/ilux2017/0.jpg"
  },
  "camaroiii": {
    brand: "Chevrolet",
    model: "Camaro",
    version: "6.2 SS Coupe V8",
    year: 2018,
    price: 32990000,
    km: 42000,
    fuel: "Bencina",
    transmission: "Automática",
    bodyType: "Coupé",
    engine: "6.2L V8 LT1",
    power: "455 HP",
    traction: "RWD",
    doors: 2,
    owners: 1,
    featured: true,
    frontImage: "/cars/inventory/camaroiii/2.jpg"
  },
  "cerato": {
    brand: "Kia",
    model: "Cerato",
    version: "1.6 SX Sedán",
    year: 2018,
    price: 9990000,
    km: 74000,
    fuel: "Bencina",
    transmission: "Manual",
    bodyType: "Sedán",
    engine: "1.6L DOHC",
    power: "128 HP",
    traction: "4x2",
    doors: 4,
    owners: 1,
    featured: true,
    frontImage: "/cars/inventory/cerato/2.jpg"
  },
  "baicx55": {
    brand: "BAIC",
    model: "X55",
    version: "1.5T Elite",
    year: 2020,
    price: 8990000,
    km: 65000,
    fuel: "Bencina",
    transmission: "Manual",
    bodyType: "SUV",
    engine: "1.5L Turbo",
    power: "148 HP",
    traction: "4x2",
    doors: 5,
    owners: 1,
    featured: true,
    frontImage: "/cars/inventory/baicx55/2.jpg"
  },
  "cherytiggo2": {
    brand: "Chery",
    model: "Tiggo 2",
    version: "1.5 GLX",
    year: 2021,
    price: 7990000,
    km: 55000,
    fuel: "Bencina",
    transmission: "Manual",
    bodyType: "SUV",
    engine: "1.5L ACTECO",
    power: "105 HP",
    traction: "4x2",
    doors: 5,
    owners: 1,
    featured: true,
    frontImage: "/cars/inventory/cherytiggo2/2.jpg"
  },
  "chevroletcaptiva": {
    brand: "Chevrolet",
    model: "Captiva",
    version: "1.5T Premier 3 Filas",
    year: 2022,
    price: 15490000,
    km: 48000,
    fuel: "Bencina",
    transmission: "Automática",
    bodyType: "SUV",
    engine: "1.5L Turbo",
    power: "147 HP",
    traction: "4x2",
    doors: 5,
    owners: 1,
    featured: true,
    frontImage: "/cars/inventory/chevroletcaptiva/2.jpg"
  },
  "chvrolettracker12t": {
    brand: "Chevrolet",
    model: "Tracker",
    version: "1.2 Turbo Premier",
    year: 2022,
    price: 14990000,
    km: 39000,
    fuel: "Bencina",
    transmission: "Automática",
    bodyType: "SUV",
    engine: "1.2L Turbo 3-Cil",
    power: "130 HP",
    traction: "4x2",
    doors: 5,
    owners: 1,
    featured: true,
    frontImage: "/cars/inventory/chvrolettracker12t/2.jpg"
  },
  "expedition35limited4x4": {
    brand: "Ford",
    model: "Expedition",
    version: "3.5 EcoBoost Limited 4x4",
    year: 2019,
    price: 34990000,
    km: 72000,
    fuel: "Bencina",
    transmission: "Automática",
    bodyType: "SUV",
    engine: "3.5L EcoBoost V6",
    power: "375 HP",
    traction: "4x4",
    doors: 5,
    owners: 1,
    featured: true,
    frontImage: "/cars/inventory/expedition35limited4x4/2.jpg"
  },
  "expert": {
    brand: "Peugeot",
    model: "Expert",
    version: "2.0 BlueHDi L2H1",
    year: 2020,
    price: 14990000,
    km: 85000,
    fuel: "Diésel",
    transmission: "Manual",
    bodyType: "Furgón",
    engine: "2.0L BlueHDi",
    power: "150 HP",
    traction: "4x2",
    doors: 4,
    owners: 1,
    featured: true,
    frontImage: "/cars/inventory/expert/2.jpg"
  },
  "fordedge": {
    brand: "Ford",
    model: "Edge",
    version: "2.0 EcoBoost Titanium AWD",
    year: 2020,
    price: 19990000,
    km: 68000,
    fuel: "Bencina",
    transmission: "Automática",
    bodyType: "SUV",
    engine: "2.0L EcoBoost",
    power: "250 HP",
    traction: "AWD",
    doors: 5,
    owners: 1,
    featured: true,
    frontImage: "/cars/inventory/fordedge/1.jpg"
  },
  "fordranger": {
    brand: "Ford",
    model: "Ranger",
    version: "3.2 TDCi Limited 4x4",
    year: 2021,
    price: 23990000,
    km: 79000,
    fuel: "Diésel",
    transmission: "Automática",
    bodyType: "Pickup",
    engine: "3.2L Duratorq 5-Cil",
    power: "200 HP",
    traction: "4x4",
    doors: 4,
    owners: 1,
    featured: true,
    frontImage: "/cars/inventory/fordranger/2.jpg"
  },
  "gaut2008": {
    brand: "Peugeot",
    model: "2008",
    version: "1.2 PureTech Allure",
    year: 2020,
    price: 13990000,
    km: 52000,
    fuel: "Bencina",
    transmission: "Manual",
    bodyType: "SUV",
    engine: "1.2L PureTech Turbo",
    power: "130 HP",
    traction: "4x2",
    doors: 5,
    owners: 1,
    featured: true,
    frontImage: "/cars/inventory/gaut2008/2.jpg"
  },
  "gaut208": {
    brand: "Peugeot",
    model: "208",
    version: "1.2 PureTech Active Pack",
    year: 2020,
    price: 10990000,
    km: 49000,
    fuel: "Bencina",
    transmission: "Manual",
    bodyType: "Hatchback",
    engine: "1.2L PureTech",
    power: "100 HP",
    traction: "4x2",
    doors: 5,
    owners: 1,
    featured: true,
    frontImage: "/cars/inventory/gaut208/2.jpg"
  },
  "gaut3008": {
    brand: "Peugeot",
    model: "3008",
    version: "1.6 THP GT Line",
    year: 2021,
    price: 18990000,
    km: 56000,
    fuel: "Bencina",
    transmission: "Automática",
    bodyType: "SUV",
    engine: "1.6L Turbo PureTech",
    power: "165 HP",
    traction: "4x2",
    doors: 5,
    owners: 1,
    featured: true,
    frontImage: "/cars/inventory/gaut3008/2.jpg"
  },
  "grandi10blanco": {
    brand: "Hyundai",
    model: "Grand i10",
    version: "1.2 GLS Sedán",
    year: 2020,
    price: 7990000,
    km: 61000,
    fuel: "Bencina",
    transmission: "Manual",
    bodyType: "Sedán",
    engine: "1.2L Kappa",
    power: "86 HP",
    traction: "4x2",
    doors: 4,
    owners: 1,
    featured: true,
    frontImage: "/cars/inventory/grandi10blanco/2.jpg"
  },
  "hyundaii102018subido": {
    brand: "Hyundai",
    model: "Grand i10",
    version: "1.2 GLS Hatchback",
    year: 2018,
    price: 6990000,
    km: 82000,
    fuel: "Bencina",
    transmission: "Manual",
    bodyType: "Hatchback",
    engine: "1.2L Kappa",
    power: "86 HP",
    traction: "4x2",
    doors: 5,
    owners: 1,
    featured: true,
    frontImage: "/cars/inventory/hyundaii102018subido/2.jpg"
  },
  "i20202014": {
    brand: "Hyundai",
    model: "i20 Active",
    version: "1.4 GL Crossover",
    year: 2020,
    price: 9490000,
    km: 67000,
    fuel: "Bencina",
    transmission: "Manual",
    bodyType: "SUV",
    engine: "1.4L Kappa",
    power: "99 HP",
    traction: "4x2",
    doors: 5,
    owners: 1,
    featured: true,
    frontImage: "/cars/inventory/i20202014/2.jpg"
  },
  "jact8": {
    brand: "JAC",
    model: "T8",
    version: "2.0 CTI Advance 4x4",
    year: 2021,
    price: 13990000,
    km: 78000,
    fuel: "Diésel",
    transmission: "Manual",
    bodyType: "Pickup",
    engine: "2.0L CTI Turbo Diésel",
    power: "137 HP",
    traction: "4x4",
    doors: 4,
    owners: 1,
    featured: true,
    frontImage: "/cars/inventory/jact8/2.jpg"
  },
  "jmcviguswork": {
    brand: "JMC",
    model: "Vigus Work",
    version: "2.5 TD 4x4 Doble Cabina",
    year: 2021,
    price: 11990000,
    km: 84000,
    fuel: "Diésel",
    transmission: "Manual",
    bodyType: "Pickup",
    engine: "2.5L Turbo Diésel Isuzu Tech",
    power: "123 HP",
    traction: "4x4",
    doors: 4,
    owners: 1,
    featured: true,
    frontImage: "/cars/inventory/jmcviguswork/2.jpg"
  },
  "kiario4ex142021": {
    brand: "Kia",
    model: "Rio 4",
    version: "1.4 EX Sedán",
    year: 2021,
    price: 9990000,
    km: 51000,
    fuel: "Bencina",
    transmission: "Manual",
    bodyType: "Sedán",
    engine: "1.4L Kappa MPI",
    power: "99 HP",
    traction: "4x2",
    doors: 4,
    owners: 1,
    featured: true,
    frontImage: "/cars/inventory/kiario4ex142021/2.jpg"
  },
  "azul5400": {
    brand: "MG",
    model: "ZS",
    version: "1.5 STD 4x2",
    year: 2021,
    price: 9490000,
    km: 54000,
    fuel: "Bencina",
    transmission: "Manual",
    bodyType: "SUV",
    engine: "1.5L NSE",
    power: "114 HP",
    traction: "4x2",
    doors: 5,
    owners: 1,
    featured: true,
    frontImage: "/cars/inventory/azul5400/2.jpg"
  },
  "mitsumiragemt12": {
    brand: "Mitsubishi",
    model: "Mirage",
    version: "1.2 GLS",
    year: 2021,
    price: 7490000,
    km: 47000,
    fuel: "Bencina",
    transmission: "Manual",
    bodyType: "Hatchback",
    engine: "1.2L MIVEC",
    power: "78 HP",
    traction: "4x2",
    doors: 5,
    owners: 1,
    featured: true,
    frontImage: "/cars/inventory/mitsumiragemt12/2.jpg"
  },
  "np300": {
    brand: "Nissan",
    model: "NP300 Navara",
    version: "2.3 TD SE 4x2 Doble Cabina",
    year: 2021,
    price: 16990000,
    km: 83000,
    fuel: "Diésel",
    transmission: "Manual",
    bodyType: "Pickup",
    engine: "2.3L Turbo Diésel",
    power: "160 HP",
    traction: "4x2",
    doors: 4,
    owners: 1,
    featured: true,
    frontImage: "/cars/inventory/np300/2.jpg"
  },
  "opelcorsamt512": {
    brand: "Opel",
    model: "Corsa",
    version: "1.2 Edition MT5",
    year: 2021,
    price: 9990000,
    km: 46000,
    fuel: "Bencina",
    transmission: "Manual",
    bodyType: "Hatchback",
    engine: "1.2L PureTech",
    power: "75 HP",
    traction: "4x2",
    doors: 5,
    owners: 1,
    featured: true,
    frontImage: "/cars/inventory/opelcorsamt512/2.jpg"
  },
  "prisma": {
    brand: "Chevrolet",
    model: "Prisma",
    version: "1.4 LTZ Sedán",
    year: 2019,
    price: 7490000,
    km: 68000,
    fuel: "Bencina",
    transmission: "Manual",
    bodyType: "Sedán",
    engine: "1.4L SPE/4",
    power: "98 HP",
    traction: "4x2",
    doors: 4,
    owners: 1,
    featured: true,
    frontImage: "/cars/inventory/prisma/2.jpg"
  },
  "sparksedan": {
    brand: "Chevrolet",
    model: "Spark GT",
    version: "1.2 LT Sedán",
    year: 2020,
    price: 6490000,
    km: 59000,
    fuel: "Bencina",
    transmission: "Manual",
    bodyType: "Sedán",
    engine: "1.2L S-TEC II",
    power: "81 HP",
    traction: "4x2",
    doors: 4,
    owners: 1,
    featured: true,
    frontImage: "/cars/inventory/sparksedan/2.jpg"
  },
  "subaruxv": {
    brand: "Subaru",
    model: "XV",
    version: "2.0i AWD Lineartronic",
    year: 2020,
    price: 15990000,
    km: 63000,
    fuel: "Bencina",
    transmission: "Automática",
    bodyType: "SUV",
    engine: "2.0L Boxer Direct Injection",
    power: "156 HP",
    traction: "AWD",
    doors: 5,
    owners: 1,
    featured: true,
    frontImage: "/cars/inventory/subaruxv/2.jpg"
  },
  "tiggo8": {
    brand: "Chery",
    model: "Tiggo 8",
    version: "1.6 TGDI GLS 3 Filas",
    year: 2022,
    price: 15990000,
    km: 43000,
    fuel: "Bencina",
    transmission: "Automática",
    bodyType: "SUV",
    engine: "1.6L TGDI ACTECO",
    power: "183 HP",
    traction: "4x2",
    doors: 5,
    owners: 1,
    featured: true,
    frontImage: "/cars/inventory/tiggo8/2.jpg"
  },
  "ilux2022": {
    brand: "Toyota",
    model: "Hilux",
    version: "2.4 DX 4x4 Doble Cabina",
    year: 2022,
    price: 23990000,
    km: 58000,
    fuel: "Diésel",
    transmission: "Manual",
    bodyType: "Pickup",
    engine: "2.4L Turbo Diésel",
    power: "150 HP",
    traction: "4x4",
    doors: 4,
    owners: 1,
    featured: true,
    frontImage: "/cars/inventory/ilux2022/2.jpg"
  },
  "tucson": {
    brand: "Hyundai",
    model: "Tucson",
    version: "2.0 CRDi 4x4 GLS",
    year: 2021,
    price: 18490000,
    km: 62000,
    fuel: "Diésel",
    transmission: "Automática",
    bodyType: "SUV",
    engine: "2.0L CRDi Turbo Diésel",
    power: "185 HP",
    traction: "4x4",
    doors: 5,
    owners: 1,
    featured: true,
    frontImage: "/cars/inventory/tucson/2.jpg"
  },
  "vkvoyage": {
    brand: "Volkswagen",
    model: "Voyage",
    version: "1.6 Trendline Sedán",
    year: 2021,
    price: 8490000,
    km: 56000,
    fuel: "Bencina",
    transmission: "Manual",
    bodyType: "Sedán",
    engine: "1.6L MSI",
    power: "101 HP",
    traction: "4x2",
    doors: 4,
    owners: 1,
    featured: true,
    frontImage: "/cars/inventory/vkvoyage/2.jpg"
  },
  "voloss60": {
    brand: "Volvo",
    model: "S60",
    version: "2.0 T5 Momentum Geartronic",
    year: 2019,
    price: 18990000,
    km: 69000,
    fuel: "Bencina",
    transmission: "Automática",
    bodyType: "Sedán",
    engine: "2.0L Turbo Drive-E",
    power: "254 HP",
    traction: "FWD",
    doors: 4,
    owners: 1,
    featured: true,
    frontImage: "/cars/inventory/voloss60/2.jpg"
  }
};

async function main() {
  const vehiclesJsonPath = "data/vehicles.json";

  // Featured order for the top Hero showcase:
  const prioritySlugs = [
    "camaroiii",
    "ilux2017",
    "dxtz99",
    "jspb25",
    "hjcw79",
    "fhvc10",
    "fvrg86",
    "fordranger",
    "subaruxv",
    "gaut3008",
    "tiggo8",
    "chevroletcaptiva"
  ];

  const updatedVehicles = [];
  const processedFolders = new Set();

  // First add priority vehicles in order:
  for (const slugKey of prioritySlugs) {
    if (SPECIFIC_VEHICLES[slugKey]) {
      const spec = SPECIFIC_VEHICLES[slugKey];
      const invDir = path.join("public/cars/inventory", slugKey);
      let gallery = [];
      if (fs.existsSync(invDir)) {
        gallery = fs.readdirSync(invDir)
          .filter(f => f.endsWith(".jpg") || f.endsWith(".png"))
          .sort((a, b) => {
            const numA = parseInt(a);
            const numB = parseInt(b);
            if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
            return a.localeCompare(b);
          })
          .map(f => `/cars/inventory/${slugKey}/${f}`);
      }

      const frontImg = spec.frontImage;
      const filteredGal = gallery.filter(g => g !== frontImg);
      const finalGallery = [frontImg, ...filteredGal];

      const slug = `${spec.brand.toLowerCase()}-${spec.model.toLowerCase()}-${spec.year}-${slugKey}`.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

      updatedVehicles.push({
        slug,
        brand: spec.brand,
        model: spec.model,
        version: spec.version,
        year: spec.year,
        price: spec.price,
        km: spec.km,
        fuel: spec.fuel,
        transmission: spec.transmission,
        bodyType: spec.bodyType,
        location: "Puerto Montt, Los Lagos",
        image: frontImg,
        gallery: finalGallery,
        engine: spec.engine,
        power: spec.power,
        traction: spec.traction,
        doors: spec.doors,
        owners: spec.owners,
        featured: true,
        status: "Disponible",
        highlights: [
          "Inspección mecánica de 150 puntos aprobada",
          "Documentación y transferibilidad inmediata al día",
          "Opción de financiamiento con pie desde 20%"
        ]
      });
      processedFolders.add(slugKey);
    }
  }

  // Next, process all remaining specific vehicles
  for (const [slugKey, spec] of Object.entries(SPECIFIC_VEHICLES)) {
    if (processedFolders.has(slugKey)) continue;
    const invDir = path.join("public/cars/inventory", slugKey);
    let gallery = [];
    if (fs.existsSync(invDir)) {
      gallery = fs.readdirSync(invDir)
        .filter(f => f.endsWith(".jpg") || f.endsWith(".png"))
        .map(f => `/cars/inventory/${slugKey}/${f}`);
    }

    const frontImg = spec.frontImage;
    const filteredGal = gallery.filter(g => g !== frontImg);
    const finalGallery = [frontImg, ...filteredGal];

    const slug = `${spec.brand.toLowerCase()}-${spec.model.toLowerCase()}-${spec.year}-${slugKey}`.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

    updatedVehicles.push({
      slug,
      brand: spec.brand,
      model: spec.model,
      version: spec.version,
      year: spec.year,
      price: spec.price,
      km: spec.km,
      fuel: spec.fuel,
      transmission: spec.transmission,
      bodyType: spec.bodyType,
      location: "Puerto Montt, Los Lagos",
      image: frontImg,
      gallery: finalGallery,
      engine: spec.engine,
      power: spec.power,
      traction: spec.traction,
      doors: spec.doors,
      owners: spec.owners,
      featured: spec.featured ?? false,
      status: "Disponible",
      highlights: [
        "Inspección mecánica de 150 puntos aprobada",
        "Documentación y transferibilidad inmediata al día",
        "Opción de financiamiento con pie desde 20%"
      ]
    });
    processedFolders.add(slugKey);
  }

  // Then process any other scanned inventory items that have real photos
  const inventoryRoot = "public/cars/inventory";
  const allFolders = fs.readdirSync(inventoryRoot);
  for (const folder of allFolders) {
    if (processedFolders.has(folder)) continue;
    const dir = path.join(inventoryRoot, folder);
    if (!fs.statSync(dir).isDirectory()) continue;
    const files = fs.readdirSync(dir).filter(f => f.endsWith(".jpg") || f.endsWith(".png"));
    if (files.length === 0) continue;

    const frontImg = files.includes("0.jpg") ? `/cars/inventory/${folder}/0.jpg` : `/cars/inventory/${folder}/${files[0]}`;
    const gallery = files.map(f => `/cars/inventory/${folder}/${f}`);

    const isPlate = /^[a-z]{4}\d{2}$/i.test(folder);
    const brand = isPlate ? "Toyota" : "Vehículo";
    const model = isPlate ? "Hilux" : folder.toUpperCase();

    updatedVehicles.push({
      slug: `${brand.toLowerCase()}-${model.toLowerCase()}-2021-${folder}`.replace(/[^a-z0-9]+/g, "-"),
      brand: brand,
      model: model,
      version: "2.4 DX 4x4 Doble Cabina",
      year: 2021,
      price: 18990000,
      km: 120000,
      fuel: "Diésel",
      transmission: "Manual",
      bodyType: "Pickup",
      location: "Puerto Montt, Los Lagos",
      image: frontImg,
      gallery: gallery,
      engine: "2.4L Turbo Diésel",
      power: "150 HP",
      traction: "4x4",
      doors: 4,
      owners: 1,
      featured: false,
      status: "Disponible",
      highlights: [
        "Inspección mecánica de 150 puntos aprobada",
        "Documentación y transferibilidad inmediata al día"
      ]
    });
  }

  // Save to data/vehicles.json
  fs.writeFileSync(vehiclesJsonPath, JSON.stringify(updatedVehicles, null, 2), "utf8");
  console.log(`✅ Saved ${updatedVehicles.length} vehicles to data/vehicles.json`);

  // Write to lib/vehicles.ts with ALL full helper functions intact
  const tsContent = `// Auto-generated full inventory from local drive
export interface VehicleSpin {
  count: number;
  pattern?: string;
  ext?: string;
}

export interface Vehicle {
  slug: string;
  brand: string;
  model: string;
  version: string;
  year: number;
  price: number;
  km: number;
  fuel: string;
  transmission: string;
  bodyType: string;
  location: string;
  image: string;
  gallery?: string[];
  spin?: VehicleSpin;
  engine: string;
  power: string;
  traction: string;
  doors: number;
  owners: number;
  featured?: boolean;
  status?: "Disponible" | "En reserva" | "Vendido" | "Borrador";
  highlights?: string[];
}

export const initialVehicles: Vehicle[] = ${JSON.stringify(updatedVehicles, null, 2)};

export const vehicles: Vehicle[] = initialVehicles;

export function getVehicle(slug: string): Vehicle | undefined {
  return vehicles.find((v) => v.slug === slug);
}

export function formatCLP(amount: number): string {
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatKm(km: number): string {
  return new Intl.NumberFormat("es-CL").format(km) + " km";
}

export function estimateMonthly(price: number, termMonths = 48, piePercent = 0.2): number {
  const financed = price * (1 - piePercent);
  const monthlyRate = 0.0129; // ~1.29% mensual
  const factor = (monthlyRate * Math.pow(1 + monthlyRate, termMonths)) / (Math.pow(1 + monthlyRate, termMonths) - 1);
  return Math.round(financed * factor);
}

export function spinFramesOf(v: Vehicle): string[] {
  if (!v.spin || v.spin.count <= 0) return [];
  const { count, pattern = "" } = v.spin;
  return Array.from({ length: count }, (_, i) =>
    pattern ? pattern.replace("{index}", String(i + 1).padStart(3, "0")) : ""
  ).filter(Boolean);
}

export function specsOf(v: Vehicle): { label: string; value: string }[] {
  return [
    { label: "Kilometraje", value: \`\${v.km.toLocaleString("es-CL")} km\` },
    { label: "Año", value: String(v.year) },
    { label: "Combustible", value: v.fuel },
    { label: "Transmisión", value: v.transmission },
    { label: "Potencia", value: v.power },
    { label: "Dueños", value: String(v.owners) },
    { label: "Puertas", value: String(v.doors) },
    { label: "Ubicación", value: v.location },
  ];
}

export const BRANDS = [
  "Toyota",
  "Mitsubishi",
  "Chevrolet",
  "Nissan",
  "Great Wall",
  "Peugeot",
  "Fiat",
  "Hyundai",
  "Subaru",
  "Renault",
  "DFSK",
  "Mercedes-Benz",
  "Ford",
  "Volkswagen",
  "Kia",
  "Suzuki",
  "Otro",
];

export const BODY_TYPES = [
  "Pickup",
  "SUV",
  "Furgón",
  "Sedán",
  "Hatchback",
  "Station Wagon",
  "Otro",
];

export const FUELS = ["Diésel", "Bencina", "Híbrido", "Eléctrico"];

export const TRANSMISSIONS = ["Automática", "Manual"];

export const STATUS_TYPES = ["Disponible", "En reserva", "Vendido", "Borrador"] as const;
`;

  fs.writeFileSync("lib/vehicles.ts", tsContent, "utf8");
  console.log(`✅ Saved ${updatedVehicles.length} vehicles to lib/vehicles.ts with all helpers intact`);
}

main().catch(console.error);
