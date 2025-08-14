import Student from './Student.jsx'
//props are readonly properties shared between components
//parent component can send data to a child
//<component key = value>

function App() {
  return (
    <div>
     <>
      <Student name="ProfBatsi" age={27} student={false}/>
      <Student name="Isaiah" age={26} student={true}/>
      <Student name="Takura" age={26} student={false}/>
      <Student name="Nick" age={28} student={false}/>
     </>
    </div>
  );
}

export default App
