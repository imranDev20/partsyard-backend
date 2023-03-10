const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const jwt = require("jsonwebtoken");
require("dotenv").config();

const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const app = express();
const port = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

function verifyJWT(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).send({ message: "Unauthorized access" });
  }
  const token = authHeader.split(" ")[1];
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).send({ message: "Forbidden access" });
    }
    req.decoded = decoded;
    next();
  });
}

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
    const usersCollection = database.collection("usersCollection");
    const paymentsCollection = database.collection("paymentsCollection");

    // Make admin
    app.put("/user/admin/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;
      const requester = req.decoded.email;
      const requesterAccoount = await usersCollection.findOne({
        email: requester,
      });
      if (requesterAccoount.role === "admin") {
        const filter = { email: email };
        const updateDoc = {
          $set: { role: "admin" },
        };
        const result = await usersCollection.updateOne(filter, updateDoc);

        res.send(result);
      } else {
        res.status(403).send({ message: "Forbidden access" });
      }
    });

    // Check admin
    app.get("/admin/:email", async (req, res) => {
      const email = req.params.email;
      const user = await usersCollection.findOne({ email: email });
      const isAdmin = user.role === "admin";
      res.send({ admin: isAdmin });
    });

    // Add or update user
    app.put("/user/:email", async (req, res) => {
      const email = req.params.email;
      const user = req.body;
      const filter = { email: email };
      const options = { upsert: true };
      const updateDoc = {
        $set: user,
      };
      const result = await usersCollection.updateOne(
        filter,
        updateDoc,
        options
      );
      const token = jwt.sign({ email: email }, process.env.ACCESS_TOKEN_SECRET);

      res.send({ result, token });
    });

    // Load all users
    app.get("/users", async (req, res) => {
      const query = {};
      const cursor = usersCollection.find(query);
      const usersArray = await cursor.toArray();
      res.send(usersArray);
    });

    // Load single user
    app.get("/user/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const result = await usersCollection.findOne(query);
      res.send(result);
    });

    // Load all parts
    app.get("/parts", async (req, res) => {
      const query = {};
      const cursor = partsCollection.find(query);
      const partsArray = await cursor.toArray();
      res.send(partsArray);
    });

    // Add a new part
    app.post("/parts", async (req, res) => {
      const newPart = req.body;
      console.log("adding new item", newPart);
      const result = await partsCollection.insertOne(newPart);
      console.log(`A document was inserted with the _id: ${result.insertedId}`);
      res.send(result);
    });

    // Load Single motor part
    app.get("/parts/:partId", async (req, res) => {
      const id = req.params.partId;
      const query = { _id: ObjectId(id) };
      const result = await partsCollection.findOne(query);
      res.send(result);
    });

    // Delete a part
    app.delete("/part/:partId", async (req, res) => {
      const id = req.params.partId;
      const query = { _id: ObjectId(id) };
      const result = await partsCollection.deleteOne(query);
      res.send(result);
      console.log(result);
    });

    // Load all orders
    app.get("/orders", verifyJWT, async (req, res) => {
      const query = {};
      const cursor = ordersCollection.find(query);
      const ordersArray = await cursor.toArray();
      res.send(ordersArray);
    });

    // Load single order for payment
    app.get("/order/:orderId", async (req, res) => {
      const id = req.params.orderId;
      const query = { _id: ObjectId(id) };
      const result = await ordersCollection.findOne(query);
      res.send(result);
    });

    // Stripe Payment
    app.post("/create-payment-intent", verifyJWT, async (req, res) => {
      const part = req.body;
      console.log(part);
      const price = part.price;
      const amount = price * 100;
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });
      res.send({ clientSecret: paymentIntent.client_secret });
    });

    // Update order after payment
    app.patch("/order/:orderId", verifyJWT, async (req, res) => {
      const id = req.params.orderId;
      const payment = req.body;
      const filter = { _id: ObjectId(id) };
      const updatedDoc = {
        $set: {
          paid: true,
          transactionId: payment.transactionId,
        },
      };

      const updatedOrder = await ordersCollection.updateOne(filter, updatedDoc);
      const result = await paymentsCollection.insertOne(payment);
      res.send(updatedDoc);
    });

    // Get Filtered orders
    app.get("/orders/filter", verifyJWT, async (req, res) => {
      const email = req.query.email;
      const decodedEmail = req.decoded.email;
      console.log(decodedEmail);
      if (email === decodedEmail) {
        const query = { email: email };
        const cursor = ordersCollection.find(query);
        const orders = await cursor.toArray();
        return res.send(orders);
      } else {
        return res.status(403).send({ message: "Forbidden access" });
      }
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

    // Delete an order
    app.delete("/order/:orderId", async (req, res) => {
      const id = req.params.orderId;
      const query = { _id: ObjectId(id) };
      const result = await ordersCollection.deleteOne(query);
      res.send(result);
      console.log(result);
    });

    // Load all reviews
    app.get("/reviews", async (req, res) => {
      const query = {};
      const cursor = reviewsCollection.find(query);
      const reviewsArray = await cursor.toArray();
      res.send(reviewsArray);
    });

    // Create new review
    app.post("/reviews", async (req, res) => {
      const newReview = req.body;
      console.log(newReview);
      console.log("adding new review", newReview);
      const result = await reviewsCollection.insertOne(newReview);
      console.log(`A document was inserted with the _id: ${result.insertedId}`);
      res.send(result);
      console.log(result);
    });

    // Get Filtered payments
    app.get("/payments/filter/", verifyJWT, async (req, res) => {
      const decodedEmail = req.decoded.email;
      const email = req.query.email;
      if (email === decodedEmail) {
        const query = { email: email };
        const cursor = paymentsCollection.find(query);
        const paymentsArray = await cursor.toArray();
        res.send(paymentsArray);
      } else {
        res.status(403).send({ message: "Forbidden Access" });
      }
    });
  } finally {
  }
};

run().catch(console.dir);

app.listen(port, () => {
  console.log("Listening to port  ", port);
});
