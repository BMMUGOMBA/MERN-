function Food() {

    const food1 = "Pizza";
    const food2 = "Burger";

  return (
    <div>
        <ul>
            <li>{food1}</li>
            <li>{food2}</li>
            <li>{food1.toLocaleUpperCase}</li>
        </ul>
    </div>
  );
}