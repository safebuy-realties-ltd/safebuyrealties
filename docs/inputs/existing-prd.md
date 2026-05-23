# **🧠 1\. PRODUCT REQUIREMENTS DOCUMENT (PRD)**

## **🏷 Product Name**

SafeBuyRealties

---

## **🎯 Product Vision**

A **secure real estate transaction platform** that ensures:

* Verified listings only  
* Structured due diligence  
* Multi-professional validation  
* Safe payment flow

---

## **👥 User Roles (CORE)**

### **1\. Buyer**

* Browse verified listings  
* Initiate transaction  
* Upload KYC  
* Track due diligence  
* Make payments  
* View status

---

### **2\. Seller**

* Create listing  
* Upload documents (C of O, Survey, etc.)  
* Track verification  
* Respond to queries

---

### **3\. Property Professionals (VERY IMPORTANT FROM DOC)**

Derived from 

#### **Types:**

* Lawyer  
* Surveyor  
* Valuer  
* Architect  
* Engineer  
* Builder  
* Quantity Surveyor

#### **Capabilities:**

* Accept assignments  
* Upload reports (legal, survey, valuation, etc.)  
* Flag risks (e.g. dispute, flood risk, omo-onile issues)  
* Mark verification stage complete

---

### **4\. Internal Staff**

* Assign professionals  
* Review reports  
* Approve/reject listings  
* Manage workflow

---

### **5\. Admin**

* Full control  
* Manage users  
* Override decisions  
* Analytics

---

# **🔄 CORE SYSTEM FLOW**

### **🟢 Listing Flow**

Seller → Upload → Pending → Assigned → Verified → Live

---

### **🟢 Due Diligence Flow**

Buyer initiates →  
System assigns professionals →  
Each uploads report →  
Final decision →  
Proceed to payment

---

### **🟢 Transaction Flow**

Buyer pays →  
Funds tracked →  
Conditions satisfied →  
Release

---

# **🧩 MODULES**

## **1\. Auth & RBAC**

* JWT-based auth  
* Role-based permissions

---

## **2\. Listings**

* CRUD listings  
* Document upload  
* Status tracking

---

## **3\. Verification Engine**

* Multi-stage workflow:  
  * Legal check  
  * Survey check  
  * Valuation  
  * Risk flags

---

## **4\. Task Assignment System**

* Assign professionals  
* Track progress  
* Status updates

---

## **5\. Payments**

* Paystack / Flutterwave integration  
* Transaction logs

---

## **6\. Dashboard**

Different UI per role

---

## **7\. Notifications**

* Email/SMS (later)  
* In-app alerts

---

# **🔌 API ENDPOINTS (CORE)**

## **Auth**

* POST /auth/register  
* POST /auth/login  
* GET /auth/me

---

## **Users**

* GET /users  
* GET /users/:id  
* PATCH /users/:id

---

## **Listings**

* POST /listings  
* GET /listings  
* GET /listings/:id  
* PATCH /listings/:id  
* DELETE /listings/:id

---

## **Documents**

* POST /documents/upload  
* GET /documents/:listingId

---

## **Verification**

* POST /verification/assign  
* GET /verification/:listingId  
* PATCH /verification/:step

---

## **Tasks**

* GET /tasks/me  
* PATCH /tasks/:id

---

## **Payments**

* POST /payments/initiate  
* POST /payments/webhook  
* GET /payments/:id

---

# **🗄 DATABASE (HIGH LEVEL)**

Users  
Listings  
Documents  
VerificationSteps  
Tasks  
Transactions

---

# **🎨 DESIGN SYSTEM**

* Primary Color: Deep Classy Green (\#0B6B3A)  
* White \+ light gray background  
* Clean, minimal  
* Enterprise feel

