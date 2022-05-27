const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const jwt = require("jsonwebtoken");
require("dotenv").config();
const app = express();

const port = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("Successfully running server on port");
});

const uri = `mongodb+srv://${process.env.MONGO_USER}:${process.env.MONGO_PASSWORD}@cluster0.k8znc.mongodb.net/?retryWrites=true&w=majority`;

const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1,
});

const run = async () => {
  try {
    await client.connect();
    const database = client.db("partsYard");
    const partsCollection = database.collection("partsCollection");
    const reviewsCollection = database.collection("reviewsCollection");
    const ordersCollection = database.collection("ordersCollection");

    // Load all parts
    app.get("/parts", async (req, res) => {
      const query = {};
      const cursor = partsCollection.find(query);
      const partsArray = await cursor.toArray();
      res.send(partsArray);
    });

    // Load Single motor part
    app.get("/parts/:partId", async (req, res) => {
      const id = req.params.partId;
      const query = { _id: ObjectId(id) };
      const result = await partsCollection.findOne(query);
      res.send(result);
    });

    // Get Filtered orders
    app.get("/orders/filter", async (req, res) => {
      const email = req.query.email;
      console.log(email);
      const query = { email: email };
      const cursor = ordersCollection.find(query);
      const orders = await cursor.toArray();
      res.send(orders);
    });

    // Create new order
    app.post("/orders", async (req, res) => {
      const newOrder = req.body;
      console.log(newOrder);
      console.log("adding new order", newOrder);
      const result = await ordersCollection.insertOne(newOrder);
      console.log(`A document was inserted with the _id: ${result.insertedId}`);
      res.send(result);
      console.log(result);
    });
  } finally {
  }
};

run().catch(console.dir);

app.listen(port, () => {
  console.log("Listening to port  ", port);
});
