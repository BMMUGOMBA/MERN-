//conditional rendering allows you to control what gets rendered in your application
//based on certainconditions
//show hide or change components

import UserGreeting from './UserGreeting.jsx'

function App() {
  return(
    <>
      <UserGreeting isLoggedIn = {false} username="ProfBatsi"/> 
    </>
  )
}

export default App
