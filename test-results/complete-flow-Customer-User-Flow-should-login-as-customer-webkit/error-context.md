# Page snapshot

```yaml
- generic [ref=e2]:
  - navigation [ref=e3]:
    - link "📸 Photo Lab" [ref=e5]:
      - /url: /
    - generic [ref=e6]:
      - link "Albums" [ref=e7]:
        - /url: /albums
      - link "Orders" [ref=e8]:
        - /url: /orders
      - link "Cart" [ref=e9]:
        - /url: /cart
      - link "Login" [ref=e10]:
        - /url: /login
      - link "Register" [ref=e11]:
        - /url: /register
  - generic [ref=e14]:
    - heading "Sign In" [level=1] [ref=e15]
    - paragraph [ref=e16]: Welcome back to Photo Lab
    - generic [ref=e17]:
      - generic [ref=e18]:
        - text: Email
        - textbox "Email" [ref=e19]
      - generic [ref=e20]:
        - text: Password
        - textbox "Password" [ref=e21]
      - button "Sign In" [ref=e22] [cursor=pointer]
    - paragraph [ref=e23]:
      - text: Don't have an account?
      - link "Register" [ref=e24]:
        - /url: /register
```